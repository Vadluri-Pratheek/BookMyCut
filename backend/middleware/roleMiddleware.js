const requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Shop owners only.',
    });
  }

  return next();
};

module.exports = {
  requireOwner,
};
