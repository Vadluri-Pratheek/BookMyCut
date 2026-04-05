const Customer = require('../models/Customer');
const Barber = require('../models/Barber');
const Shop = require('../models/Shop');
const { sendEmail } = require('./mailer');

const buildCancellationSubject = (cancelledBy) =>
  cancelledBy === 'auto'
    ? 'BookMyCut Booking Auto-Cancelled'
    : 'BookMyCut Booking Cancelled';

const buildCancellationIntro = (cancelledBy) =>
  cancelledBy === 'auto'
    ? 'Your booking was automatically cancelled because the current-customer timer expired before the appointment was handled.'
    : 'Your booking was cancelled by the barber.';

const sendBookingCancellationNotification = async ({ booking, cancelledBy, cancellationReason }) => {
  if (!booking?.customerId) {
    return null;
  }

  const [customer, barber, shop] = await Promise.all([
    Customer.findById(booking.customerId).select('name email').lean(),
    Barber.findById(booking.barberId).select('name').lean(),
    Shop.findById(booking.shopId).select('name').lean(),
  ]);

  if (!customer?.email) {
    return null;
  }

  const lines = [
    `Hi ${customer.name || 'Customer'},`,
    '',
    buildCancellationIntro(cancelledBy),
    '',
    `Shop: ${shop?.name || 'BookMyCut'}`,
    `Barber: ${barber?.name || 'Assigned barber'}`,
    `Service: ${booking.serviceName || 'Service'}`,
    `Date: ${booking.date || '-'}`,
    `Time: ${booking.slotTimeStr || '-'}`,
    `Type: ${booking.bookingType === 'homevisit' ? 'Home Service' : 'In-Shop'}`,
  ];

  if (cancellationReason) {
    lines.push(`Reason: ${cancellationReason}`);
  }

  lines.push(
    '',
    'You can book a new slot from your dashboard whenever you are ready.',
    '',
    'BookMyCut'
  );

  return sendEmail({
    to: customer.email,
    subject: buildCancellationSubject(cancelledBy),
    text: lines.join('\n'),
  });
};

module.exports = {
  sendBookingCancellationNotification,
};
