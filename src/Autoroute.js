const _ = require('lodash');
const glob = require('glob');
// Not using lodash kebabCase since it transaform 'v1' to 'v-1'
const toSlubCase = require('to-slug-case');

class Autoroute {
  constructor (Router, actionsMap, {
    pattern = '**/*.js',
    ignore = [],
    onRequest = () => {},
    onResponse = () => {}
  } = {}) {
    this.Router = Router;
    this.actionsMap = actionsMap;
    this.pattern = pattern;
    this.ignore = ignore;
    this.onRequest = onRequest;
    this.onResponse = onResponse;
  }

  routeFromPath (basePath, filePath) {
    return (
      filePath
        .substr(basePath.length)
        .replace(/(\/index)?\.js$/i, '')
        .split('/')
        .map(toSlubCase)
        .join('/') || '/'
    );
  }

  findControllers (basePath) {
    return glob.sync(this.pattern, {
      cwd: basePath,
      ignore: this.ignore,
      absolute: true
    });
  }

  createRouteHandler (controller, action, metaList) {
    return async (req, res, next) => {
      const params = Object.assign({}, req.query, req.body, req.params);

      if (_.has(req, 'files.data')) {
        params.files = req.files;
      }

      const meta = _.reduce(req, (result, value, key) => {
        // Additional req keys needed (e.q.: 'user')
        if (metaList.indexOf(key) !== -1) {
          result[key] = value;
        }

        return result;
      }, {});

      try {
        this.onRequest({
          originalUrl: req.originalUrl,
          action,
          params,
          meta
        });
        const result = await controller[action](params, meta, {
          originalUrl: req.originalUrl,
          action
        });
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

  registerController (router, baseRoute, controller, metaList) {
    Object.keys(controller).forEach((action) => {
      if (!(action in this.actionsMap)) {
        return;
      }
      // 'Verb should be 'head', 'get', 'post', 'put', 'patch', 'delete'
      const verb = this.actionsMap[action].toLowerCase();
      let finalRoutes;

      if (['head', 'get', 'put', 'delete', 'patch'].includes(verb)) {
        // Need to define 2 routes ('/resource' & '/resource/:id')
        finalRoutes = [baseRoute, `${baseRoute.replace(/\/$/, '')}/:id`];
      } else {
        // For the post verb
        finalRoutes = [baseRoute];
      }
      const routeHandler = this.createRouteHandler(
        controller,
        action,
        metaList
      );
      // Assign routeHandler to routes
      finalRoutes.forEach((finalRoute) => {
        router[verb](finalRoute, routeHandler);
      });
    });
  }

  createRouter (controllersBasePath, metaList = []) {
    const controllerPaths = this.findControllers(controllersBasePath);
    const router = new this.Router();
    // Need to sort to have longest/most-specific route first
    controllerPaths
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
      .forEach((controllerInfo) => {
        const controller = require(controllerInfo.path);
        this.registerController(
          router,
          controllerInfo.route,
          controller,
          metaList
        );
      });

    return router;
  }
}

module.exports = {
  Autoroute
};
