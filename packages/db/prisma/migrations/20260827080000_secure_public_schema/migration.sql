-- Coretta uses Prisma through a trusted server-side PostgreSQL connection.
-- Browser roles must not access application data through Supabase PostgREST.

ALTER TABLE IF EXISTS public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Identity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UserLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."SavedRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FraudSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiActor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiInteraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."WalletUsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."WalletInteraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UserRiskProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."OtpToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."User" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Identity" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Wallet" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Session" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserLimit" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Transfer" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SavedRecipient" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AuditLog" FROM anon, authenticated;
REVOKE ALL ON TABLE public."FraudSignal" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiActor" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiConversation" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiMessage" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiFeedback" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiMemory" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiPreference" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiInteraction" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UsageRecord" FROM anon, authenticated;
REVOKE ALL ON TABLE public."WalletUsageRecord" FROM anon, authenticated;
REVOKE ALL ON TABLE public."WalletInteraction" FROM anon, authenticated;
REVOKE ALL ON TABLE public."UserRiskProfile" FROM anon, authenticated;
REVOKE ALL ON TABLE public."OtpToken" FROM anon, authenticated;
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;

-- Keep new Prisma-created objects private until a later migration grants
-- intentional Data API access and adds matching RLS policies.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
