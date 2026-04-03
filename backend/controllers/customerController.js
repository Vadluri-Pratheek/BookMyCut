const Customer = require('../models/Customer');
const { normalizeLocationPoint } = require('../utils/locationPoint');

/**
 * Updates the logged-in customer's profile.
 * Access: Protected (customer JWT required).
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, email, gender, dob, city, state, address, homeLocation } = req.body;
    const normalizedHomeLocation =
      homeLocation !== undefined ? normalizeLocationPoint(homeLocation) : undefined;

    const updates = {};
    if (name) updates.name = name.trim();
    if (phone) updates.phone = phone.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (gender) updates.gender = gender;
    if (dob) updates.dateOfBirth = new Date(dob);
    if (city !== undefined) updates.city = city != null ? String(city).trim() : '';
    else if (normalizedHomeLocation?.city) updates.city = normalizedHomeLocation.city;
    if (state !== undefined) updates.state = state != null ? String(state).trim() : '';
    else if (normalizedHomeLocation?.state) updates.state = normalizedHomeLocation.state;
    // Map the incoming 'address' from the frontend to the DB field 'location'
    if (address !== undefined) updates.location = address != null ? String(address).trim() : '';
    else if (normalizedHomeLocation?.address) updates.location = normalizedHomeLocation.address;
    // Handle homeLocation for map-based address selection
    if (homeLocation !== undefined) {
      updates.homeLocation = normalizedHomeLocation;
    }

    // Check if email is being updated and if it's already taken by another customer
    if (email) {
      const existingCustomer = await Customer.findOne({ 
        email: email.trim().toLowerCase(),
        _id: { $ne: req.user.id }
      });
      if (existingCustomer) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is already registered with another account' 
        });
      }
    }

    const customer = await Customer.findByIdAndUpdate(
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
        gender: customer.gender,
        city: customer.city || '',
        state: customer.state || '',
        dateOfBirth: customer.dateOfBirth || null,
        address: customer.location || '',
        homeLocation: customer.homeLocation || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
};
