-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT DEFAULT 'Kenya',
  landlord_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_units INTEGER DEFAULT 0,
  description TEXT
);

-- Create units table
CREATE TABLE IF NOT EXISTS units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  rent_amount DECIMAL(10,2) NOT NULL,
  tenant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant', 'maintenance')),
  lease_start_date DATE,
  lease_end_date DATE,
  deposit_amount DECIMAL(10,2),
  description TEXT
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tenant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa', 'card', 'paypal', 'stripe', 'flutterwave', 'bank_transfer')),
  payment_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id TEXT,
  receipt_url TEXT,
  notes TEXT
);

-- Create smart_locks table
CREATE TABLE IF NOT EXISTS smart_locks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  lock_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'unlocked' CHECK (status IN ('locked', 'unlocked', 'maintenance')),
  last_action_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_action_by UUID REFERENCES users(id),
  auto_lock_enabled BOOLEAN DEFAULT true,
  battery_level INTEGER DEFAULT 100
);

-- Create lock_activities table
CREATE TABLE IF NOT EXISTS lock_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  lock_id UUID REFERENCES smart_locks(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('lock', 'unlock', 'override', 'auto_lock')),
  triggered_by UUID REFERENCES users(id),
  reason TEXT,
  success BOOLEAN DEFAULT true,
  ip_address INET,
  user_agent TEXT
);

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tenant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment_due', 'payment_overdue', 'lease_expiry', 'maintenance', 'general')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_date DATE,
  days_before INTEGER DEFAULT 3,
  delivery_methods TEXT[] DEFAULT ARRAY['email'],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  recurring BOOLEAN DEFAULT false,
  recurring_interval TEXT CHECK (recurring_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payment', 'reminder', 'system', 'lock', 'maintenance')),
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  whatsapp_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  payment_reminders BOOLEAN DEFAULT true,
  lease_reminders BOOLEAN DEFAULT true,
  maintenance_alerts BOOLEAN DEFAULT true,
  system_updates BOOLEAN DEFAULT false,
  reminder_timing INTEGER DEFAULT 3 -- days before due date
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lock_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for properties
CREATE POLICY "Landlords can manage their properties" ON properties
  FOR ALL USING (landlord_id = auth.uid());

CREATE POLICY "Admins can manage all properties" ON properties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for units
CREATE POLICY "Landlords can manage their units" ON units
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties 
      WHERE id = units.property_id AND landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants can view their units" ON units
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Admins can manage all units" ON units
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for payments
CREATE POLICY "Tenants can manage their payments" ON payments
  FOR ALL USING (tenant_id = auth.uid());

CREATE POLICY "Landlords can view payments for their units" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON u.property_id = p.id
      WHERE u.id = payments.unit_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all payments" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for smart_locks
CREATE POLICY "Tenants can view their unit locks" ON smart_locks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units 
      WHERE id = smart_locks.unit_id AND tenant_id = auth.uid()
    )
  );

CREATE POLICY "Landlords can manage locks for their units" ON smart_locks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON u.property_id = p.id
      WHERE u.id = smart_locks.unit_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all locks" ON smart_locks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for reminders
CREATE POLICY "Users can view their reminders" ON reminders
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Landlords can manage reminders for their tenants" ON reminders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON u.property_id = p.id
      WHERE u.id = reminders.unit_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all reminders" ON reminders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for notifications
CREATE POLICY "Users can manage their notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for notification_preferences
CREATE POLICY "Users can manage their notification preferences" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_landlord_id ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_id ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_unit_id ON payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_smart_locks_unit_id ON smart_locks(unit_id);
CREATE INDEX IF NOT EXISTS idx_lock_activities_lock_id ON lock_activities(lock_id);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant_id ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Create functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_smart_locks_updated_at BEFORE UPDATE ON smart_locks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
