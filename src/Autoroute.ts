import * as _ from 'lodash';
import * as glob from 'glob';
import path from 'path';
// Not using lodash kebabCase since it transaform 'v1' to 'v-1'
import toSlubCase from 'to-slug-case';

import type Express from 'express';

type HttpVerb = 'head' | 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ActionsMap = Record<string, HttpVerb>;

type Controller = Record<
  string,
  (params?: Record<string, unknown>, meta?: Record<string, unknown>) => unknown
>;

type ControllerInfo = {
  path: string;
  route: string;
};

type RouterFactory = typeof Express.Router;

interface OnRequestOptions {
  originalUrl: string;
  action: string;
  params?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface OnResponseOptions extends OnRequestOptions {
  result?: unknown;
}

interface AutorouteOptions {
  pattern: string;
  ignore: string[];
  onRequest(options: OnRequestOptions): void;
  onResponse(options: OnResponseOptions): void;
}

interface ExtendedRequest extends Express.Request {
  [key: string]: any;
}

// Order define precedence
const exts = ['.js', '.cjs', '.mjs', '.ts'];

export class Autoroute {
  Router: RouterFactory;
  actionsMap: ActionsMap;
  pattern: string;
  ignore: string[];
  onRequest: (options: OnRequestOptions) => void;
  onResponse: (options: OnResponseOptions) => void;

  constructor(
    Router: RouterFactory,
    actionsMap: ActionsMap,
    options: Partial<AutorouteOptions> = {}
  ) {
    const extsNoDot = exts.map((ext) => ext.slice(1));
    const defaultOptions: AutorouteOptions = {
      pattern: `**/*.+(${extsNoDot.join('|')})`,
      ignore: [],
      onRequest: () => {
        // Do nothing
      },
      onResponse: () => {
        // Do nothing
      }
    };
    const finalOptions = { ...defaultOptions, ...options };

    this.Router = Router;
    this.actionsMap = actionsMap;
    this.pattern = finalOptions.pattern;
    this.ignore = finalOptions.ignore;
    this.onRequest = finalOptions.onRequest;
    this.onResponse = finalOptions.onResponse;
  }

  routeFromPath(basePath: string, filePath: string): string {
    const extsRegex = exts.map((ext) => `\\${ext}`).join('|');
    const replaceRegex = new RegExp(`(\\/index)?(${extsRegex})$`, 'i');

    return (
      filePath
        .substring(basePath.length)
        .replace(replaceRegex, '')
        .split('/')
        .map(toSlubCase)
        .join('/') || '/'
    );
  }

  findControllers(basePath: string): string[] {
    return glob.sync(this.pattern, {
      cwd: basePath,
      ignore: this.ignore,
      absolute: true
    });
  }

  createRouteHandler(
    controller: Controller,
    action: string,
    metaList: string[] = []
  ): Express.RequestHandler {
    return async (
      req: ExtendedRequest,
      res: Express.Response,
      next: Express.NextFunction
    ): Promise<void> => {
      const params = Object.assign({}, req.query, req.body, req.params);

      if (_.has(req, 'files.data')) {
        params.files = req.files;
      }

      const meta = _.reduce(
        req,
        (result: Record<string, unknown>, value, key) => {
          // Additional req keys needed (e.q.: 'user')
          if (metaList.indexOf(key) !== -1) {
            result[key] = value;
          }

          return result;
        },
        {}
      );

      try {
        this.onRequest({
          originalUrl: req.originalUrl,
          action,
          params,
          meta
        });
        const result = await controller[action](params, meta);
        this.onResponse({
          originalUrl: req.originalUrl,
          action,
          params,
          meta,
          result
        });

        res.json(result);
      } catch (e) {
        return next(e);
      }
    };
  }

  registerController(
    router: Express.Router,
    baseRoute: string,
    controller: Controller,
    metaList?: string[]
  ): void {
    Object.keys(controller).forEach((action) => {
      if (!(action in this.actionsMap)) {
        return;
      }

      const verb = this.actionsMap[action];
      let finalRoutes;

      if (baseRoute !== '/' && ['head', 'get', 'put', 'delete', 'patch'].includes(verb)) {
        // Need to define 2 routes ('/resource' & '/resource/:id')
        finalRoutes = [baseRoute, `${baseRoute.replace(/\/$/, '')}/:id`];
      } else {
        // For the post verb
        finalRoutes = [baseRoute];
      }
      const routeHandler = this.createRouteHandler(controller, action, metaList);

      // Assign routeHandler to routes
      finalRoutes.forEach((finalRoute) => {
        router[verb](finalRoute, routeHandler);
      });
    });
  }

  getUniqValidControllerPaths(controllerPaths: string[]): string[] {
    const uniqValids: string[] = [];

    return controllerPaths
      .map((controllerPath) => {
        const controllerParsedPath = path.parse(controllerPath);

        return {
          fullPath: controllerPath,
          noExtPath: `${controllerParsedPath.dir}/${controllerParsedPath.name}`,
          ext: controllerParsedPath.ext
        };
      })
      .filter((controllerPathInfo) => exts.indexOf(controllerPathInfo.ext) !== -1)
      .sort((controllerPathInfoA, controllerPathInfoB) => {
        if (controllerPathInfoA.noExtPath < controllerPathInfoB.noExtPath) {
          return 1;
        } else if (controllerPathInfoA.noExtPath > controllerPathInfoB.noExtPath) {
          return -1;
        } else {
          return exts.indexOf(controllerPathInfoA.ext) - exts.indexOf(controllerPathInfoB.ext);
        }
      })
      .filter((controllerPathInfo) => {
        if (uniqValids.indexOf(controllerPathInfo.noExtPath) === -1) {
          uniqValids.push(controllerPathInfo.noExtPath);
          return true;
        }
        return false;
      })
      .map((controllerPathInfo) => controllerPathInfo.fullPath);
  }

  createRouter(controllersBasePath: string, metaList: string[] = []): Express.Router {
    const controllerPaths = this.findControllers(controllersBasePath);
    const router = this.Router();
    // Need to sort to have longest/most-specific route first
    this.getUniqValidControllerPaths(controllerPaths)
      .map((controllerPath) => {
        return {
          path: controllerPath,
          route: this.routeFromPath(controllersBasePath, controllerPath)
        };
      })
      .sort((controllerInfoA, controllerInfoB) => {
        const partsA = controllerInfoA.route.split('/');
        const partsB = controllerInfoB.route.split('/');
        // Most specific route first (descending sort)

        return partsB.length - partsA.length;
      })
      .forEach((controllerInfo: ControllerInfo) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const controller = require(controllerInfo.path);

        this.registerController(router, controllerInfo.route, controller, metaList);
      });

    return router;
  }
}
