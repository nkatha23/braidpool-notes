-- Create properties table
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  landlord_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT
);

-- Create units table
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  rent_amount DECIMAL(10,2) NOT NULL,
  tenant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  smart_lock_id TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
  UNIQUE(property_id, unit_number)
);

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa', 'bank', 'card', 'paypal', 'stripe', 'flutterwave')),
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'overdue')),
  transaction_id TEXT,
  receipt_url TEXT
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payment_reminder', 'payment_success', 'payment_failed', 'lock_status', 'general')),
  read BOOLEAN DEFAULT FALSE,
  sent_via TEXT[] DEFAULT ARRAY['app'], -- app, email, sms, whatsapp
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT TRUE,
  whatsapp_notifications BOOLEAN DEFAULT TRUE,
  reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1], -- days before due date
  UNIQUE(user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Properties policies (landlords can manage their properties, admins can see all)
CREATE POLICY "landlords_manage_own_properties" ON public.properties
  FOR ALL USING (
    auth.uid() = landlord_id OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Units policies (landlords manage their units, tenants see their unit, admins see all)
CREATE POLICY "units_access_policy" ON public.units
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND landlord_id = auth.uid()) OR
    tenant_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "landlords_manage_units" ON public.units
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND landlord_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "landlords_update_units" ON public.units
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND landlord_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Payments policies (tenants see their payments, landlords see their properties' payments, admins see all)
CREATE POLICY "payments_access_policy" ON public.payments
  FOR SELECT USING (
    tenant_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND landlord_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "tenants_create_payments" ON public.payments
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "payments_update_policy" ON public.payments
  FOR UPDATE USING (
    tenant_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND landlord_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Notifications policies (users see their own notifications, admins can manage all)
CREATE POLICY "users_manage_own_notifications" ON public.notifications
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- User preferences policies (users manage their own preferences)
CREATE POLICY "users_manage_own_preferences" ON public.user_preferences
  FOR ALL USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_landlord_id ON public.properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_units_property_id ON public.units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_id ON public.units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_unit_id ON public.payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_payments_property_id ON public.payments(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
