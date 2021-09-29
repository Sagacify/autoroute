import { expect } from 'chai';
import { Autoroute, ActionsMap } from '../src/Autoroute';
import { Router } from 'express';
import path from 'path';

describe('Autoroute', () => {
  const basePath = path.join(__dirname, './mocks');
  const actionsMap: ActionsMap = {
    exists: 'head',
    read: 'get',
    create: 'post',
    update: 'put',
    partial: 'patch',
    destroy: 'delete'
  };
  const autoroute = new Autoroute(Router, actionsMap);

  it('should create a route from a path', () => {
    const filePath = path.join(basePath, '/test.js');

    expect(autoroute.routeFromPath(basePath, filePath)).to.equal('/test');
  });

  it('should not care about uppercase when creating a route', () => {
    const filePath = path.join(basePath, '/SubPath/Test.js');

    expect(autoroute.routeFromPath(basePath, filePath)).to.equal(
      '/sub-path/test'
    );
  });

  it('should find controllers in the base path', () => {
    expect(autoroute.findControllers(basePath)).to.have.members([
      path.join(basePath, '/index.ts'),
      path.join(basePath, '/test.ts'),
      path.join(basePath, '/subPath/subTest.ts'),
      path.join(basePath, '/subPath/subTest.js'),
      path.join(basePath, '/subPath/subTest.spec.ts')
    ]);
  });

  it('should ignore files matching pattern ignore option', () => {
    const autoroute2 = new Autoroute(Router, actionsMap, {
      ignore: ['**/*.spec.ts']
    });

    expect(autoroute2.findControllers(basePath)).to.have.members([
      path.join(basePath, '/index.ts'),
      path.join(basePath, '/test.ts'),
      path.join(basePath, '/subPath/subTest.js'),
      path.join(basePath, '/subPath/subTest.ts')
    ]);
  });

  it('should create route handler', () => {
    const controller = {
      create: () => {
        // Do nothing
      }
    };

    const handler = autoroute.createRouteHandler(controller, 'create', []);
    expect(handler).to.be.a('function');
  });

  it('should handle hooks in route handler', async () => {
    let resquestData, responseData;
    const hookedAutoroute = new Autoroute(Router, actionsMap, {
      onRequest: (params) => {
        resquestData = params;
      },
      onResponse: (params) => {
        responseData = params;
      }
    });
    const controller = {
      create: () => 'all done'
    };

    const handler = await hookedAutoroute.createRouteHandler(
      controller,
      'create',
      []
    );
    await handler(
      {
        originalUrl: '/test',
        query: { test: 'test' },
        body: {},
        params: {}
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      () => {
        // next
      }
    );

    expect([resquestData, responseData]).to.deep.equal([
      {
        originalUrl: '/test',
        action: 'create',
        params: { test: 'test' },
        meta: {}
      },
      {
        originalUrl: '/test',
        action: 'create',
        params: { test: 'test' },
        meta: {},
        result: 'all done'
      }
    ]);
  });

  it('should prefer js in case of duplicate controllers', async () => {
    const results = autoroute.getUniqValidControllerPaths([
      '/controllers/myController.ts',
      '/controllers/myController.js',
      '/controllers/someEntity/myController.ts'
    ]);

    expect(results).to.deep.equal([
      '/controllers/someEntity/myController.ts',
      '/controllers/myController.js'
    ]);
  });

  it('should register the controller in the router', async () => {
    const router: Router = Router();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const controller = require('./mocks/test');

    autoroute.registerController(router, '/test', controller);

    const routes = router.stack.map((layer) => ({
      path: layer.route.path,
      methods: layer.route.methods
    }));

    expect(routes).to.deep.equal([
      { path: '/test', methods: { head: true } },
      { path: '/test/:id', methods: { head: true } },
      { path: '/test', methods: { get: true } },
      { path: '/test/:id', methods: { get: true } },
      { path: '/test', methods: { post: true } },
      { path: '/test', methods: { put: true } },
      { path: '/test/:id', methods: { put: true } },
      { path: '/test', methods: { patch: true } },
      { path: '/test/:id', methods: { patch: true } },
      { path: '/test', methods: { delete: true } },
      { path: '/test/:id', methods: { delete: true } }
    ]);
  });

  it("should create a new router with routes ordered by segment's length", () => {
    const router = autoroute.createRouter(path.join(__dirname, './mocks'));
    const routes = router.stack.map((layer) => ({
      path: layer.route.path,
      methods: layer.route.methods
    }));

    // Should be sorted by longest/most-specific route first
    expect(routes).to.deep.equal([
      { path: '/sub-path/sub-test', methods: { head: true } },
      { path: '/sub-path/sub-test/:id', methods: { head: true } },
      { path: '/sub-path/sub-test', methods: { get: true } },
      { path: '/sub-path/sub-test/:id', methods: { get: true } },
      { path: '/sub-path/sub-test', methods: { post: true } },
      { path: '/sub-path/sub-test', methods: { put: true } },
      { path: '/sub-path/sub-test/:id', methods: { put: true } },
      { path: '/sub-path/sub-test', methods: { patch: true } },
      { path: '/sub-path/sub-test/:id', methods: { patch: true } },
      { path: '/sub-path/sub-test', methods: { delete: true } },
      { path: '/sub-path/sub-test/:id', methods: { delete: true } },
      { path: '/test', methods: { head: true } },
      { path: '/test/:id', methods: { head: true } },
      { path: '/test', methods: { get: true } },
      { path: '/test/:id', methods: { get: true } },
      { path: '/test', methods: { post: true } },
      { path: '/test', methods: { put: true } },
      { path: '/test/:id', methods: { put: true } },
      { path: '/test', methods: { patch: true } },
      { path: '/test/:id', methods: { patch: true } },
      { path: '/test', methods: { delete: true } },
      { path: '/test/:id', methods: { delete: true } },
      { path: '/', methods: { head: true } },
      { path: '/', methods: { get: true } },
      { path: '/', methods: { post: true } },
      { path: '/', methods: { put: true } },
      { path: '/', methods: { patch: true } },
      { path: '/', methods: { delete: true } }
    ]);
  });
});
