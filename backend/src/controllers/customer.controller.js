import User from '../models/user.model.js';

/**
 * Updates the logged-in customer's profile.
 * Access: Protected (customer JWT required).
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, email, homeLocation } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (phone) updates.phone = phone.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (homeLocation !== undefined) {
      if (!homeLocation) {
        updates.homeLocation = null;
      } else if (
        homeLocation?.lat != null &&
        homeLocation?.lng != null
      ) {
        updates.homeLocation = {
          lat: Number(homeLocation.lat),
          lng: Number(homeLocation.lng),
          ...(homeLocation.address ? { address: String(homeLocation.address).trim() } : {}),
        };
      }
    }

    // Check if email is being updated and if it's already taken
    if (email) {
      const existingCustomer = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: req.user.id },
      });
      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered with another account',
        });
      }
    }

    const customer = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        homeLocation: customer.homeLocation || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export {
  updateProfile,
};
