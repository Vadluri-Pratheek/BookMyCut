const jwt = require('jsonwebtoken');

const Barber = require('../models/Barber');

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

const protectCustomer = (req, res, next) =>
  protect(req, res, () => {
    if (req.user.userType !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Customers only.',
      });
    }

    return next();
  });

const protectBarber = (req, res, next) =>
  protect(req, res, async () => {
    if (req.user.userType !== 'barber') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Barbers only.',
      });
    }

    try {
      const barber = await Barber.findById(req.user.id).select('role shopId').lean();

      if (!barber || !barber.shopId) {
        return res.status(401).json({
          success: false,
          message: 'You are no longer assigned to a shop.',
        });
      }

      req.user = {
        ...req.user,
        role: barber.role,
        shopId: barber.shopId,
      };

      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }
  });

module.exports = {
  protect,
  protectCustomer,
  protectBarber,
};
