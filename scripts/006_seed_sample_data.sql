-- Insert sample properties
INSERT INTO properties (name, address, city, landlord_id, total_units, description) VALUES
('Sunset Apartments', '123 Sunset Boulevard', 'Nairobi', (SELECT id FROM users WHERE role = 'landlord' LIMIT 1), 8, 'Modern apartments in the heart of Nairobi'),
('Green Valley Residences', '456 Valley Road', 'Mombasa', (SELECT id FROM users WHERE role = 'landlord' LIMIT 1), 12, 'Luxury residences with ocean views');

-- Insert sample units
INSERT INTO units (property_id, unit_number, rent_amount, status, description) VALUES
((SELECT id FROM properties WHERE name = 'Sunset Apartments' LIMIT 1), '101', 1200.00, 'vacant', '1 bedroom apartment'),
((SELECT id FROM properties WHERE name = 'Sunset Apartments' LIMIT 1), '102', 1300.00, 'vacant', '1 bedroom apartment with balcony'),
((SELECT id FROM properties WHERE name = 'Sunset Apartments' LIMIT 1), '201', 1500.00, 'vacant', '2 bedroom apartment'),
((SELECT id FROM properties WHERE name = 'Sunset Apartments' LIMIT 1), '202', 1600.00, 'vacant', '2 bedroom apartment with balcony'),
((SELECT id FROM properties WHERE name = 'Green Valley Residences' LIMIT 1), '301', 2000.00, 'vacant', '3 bedroom luxury unit'),
((SELECT id FROM properties WHERE name = 'Green Valley Residences' LIMIT 1), '302', 2200.00, 'vacant', '3 bedroom luxury unit with ocean view');

-- Insert sample smart locks for units
INSERT INTO smart_locks (unit_id, lock_id, status, auto_lock_enabled, battery_level) 
SELECT 
  id, 
  'SL_' || unit_number, 
  'unlocked', 
  true, 
  FLOOR(RANDOM() * 40 + 60)::INTEGER
FROM units;

-- Insert sample notification preferences for all users
INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, payment_reminders, lease_reminders, maintenance_alerts, system_updates, reminder_timing)
SELECT 
  id,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  CASE WHEN role = 'admin' THEN true ELSE false END,
  3
FROM users;

-- Insert sample reminders
INSERT INTO reminders (tenant_id, unit_id, type, title, message, due_date, days_before, delivery_methods, status, priority) VALUES
((SELECT id FROM users WHERE role = 'tenant' LIMIT 1), (SELECT id FROM units LIMIT 1), 'payment_due', 'Rent Payment Due', 'Your rent payment is due in 3 days. Please make your payment to avoid late fees.', CURRENT_DATE + INTERVAL '3 days', 3, ARRAY['email', 'whatsapp'], 'pending', 'high'),
((SELECT id FROM users WHERE role = 'tenant' LIMIT 1 OFFSET 1), (SELECT id FROM units LIMIT 1 OFFSET 1), 'lease_expiry', 'Lease Renewal Notice', 'Your lease is expiring soon. Please contact your landlord to discuss renewal options.', CURRENT_DATE + INTERVAL '30 days', 30, ARRAY['email', 'sms'], 'pending', 'medium');

-- Insert sample notifications
INSERT INTO notifications (user_id, title, message, type, read, action_url, metadata) VALUES
((SELECT id FROM users WHERE role = 'tenant' LIMIT 1), 'Payment Reminder', 'Your rent payment is due in 3 days', 'payment', false, '/dashboard/payment', '{"amount": 1200, "due_date": "2024-01-18"}'),
((SELECT id FROM users WHERE role = 'landlord' LIMIT 1), 'New Tenant Application', 'You have a new tenant application for Unit 101', 'system', false, '/dashboard/tenants', '{"unit": "101", "applicant": "John Doe"}'),
((SELECT id FROM users WHERE role = 'admin' LIMIT 1), 'System Update', 'SmartRent system has been updated to version 2.1', 'system', false, '/dashboard/system-settings', '{"version": "2.1", "features": ["Enhanced security", "New payment methods"]}');
