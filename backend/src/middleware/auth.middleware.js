import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

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

const protectUser = protect;

const protectCustomer = protectUser;

const protectBarber = (req, res, next) =>
  protect(req, res, async () => {
    if (!req.user.roles || !req.user.roles.includes('barber')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Barbers only.',
      });
    }

    try {
      const barber = await User.findById(req.user.id).select('shopRole shopId roles').lean();

      // Ensure they actually have a shop assigned to act as a barber
      if (!barber || !barber.shopId) {
        return res.status(401).json({
          success: false,
          message: 'You are no longer assigned to a shop.',
        });
      }

      req.user = {
        ...req.user,
        role: barber.shopRole, // mapping old role to shopRole
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

export {
  protect,
  protectUser,
  protectCustomer,
  protectBarber,
};
