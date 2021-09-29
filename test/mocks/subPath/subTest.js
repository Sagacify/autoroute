module.exports = {
  exists: (params, meta) => ({ params, meta }),
  read: (params, meta) => ({ params, meta }),
  create: (params, meta) => ({ params, meta }),
  update: (params, meta) => ({ params, meta }),
  partial: (params, meta) => ({ params, meta }),
  destroy: (params, meta) => ({ params, meta }),
  internal: () => {
    // Do nothing
  }
};
