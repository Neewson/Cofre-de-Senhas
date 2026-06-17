import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';

let stripeClient: Stripe | null = null;

// Lazy initialization helper for Stripe SDK to prevent crashes if key is initially absent
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY as environment variable is required to execute Stripe transactions.');
    }
    stripeClient = new Stripe(key, {
      apiVersion: '2023-10-16' as any,
    });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON requests
  app.use(express.json());

  // API routes MUST be registered before the Vite middleware or static server

  // 1. Health & Configuration confirmation endpoint
  app.get('/api/stripe/config', (req, res) => {
    try {
      const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
      const secretKeySet = !!process.env.STRIPE_SECRET_KEY;
      res.json({
        stripeConfigured: secretKeySet && !!publishableKey,
        publishableKey,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Subscription Status Retrieval Endpoint
  app.post('/api/stripe/status', async (req, res) => {
    try {
      const { email, userId } = req.body;
      if (!email && !userId) {
        res.status(400).json({ error: 'Falta parametro de email ou userId na requisição.' });
        return;
      }

      const stripe = getStripe();
      
      // Look up existing Stripe customers by email or metadata userId
      const searchQuery = [
        email ? `email:'${email}'` : '',
        userId ? `metadata['userId']:'${userId}'` : ''
      ].filter(Boolean).join(' OR ');

      const customers = await stripe.customers.search({
        query: searchQuery,
      });

      if (customers.data.length === 0) {
        res.json({
          hasActiveSubscription: false,
          planName: 'Gratuito',
          nextPayment: null,
          customerId: null,
          subscriptions: []
        });
        return;
      }

      const customer = customers.data[0];
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });

      const activeSubscription = subscriptions.data.find(sub => sub.status === 'active' || sub.status === 'trialing');

      if (activeSubscription) {
        const subAny = activeSubscription as any;
        res.json({
          hasActiveSubscription: true,
          planName: 'Premium Cloud Sync',
          nextPayment: new Date(subAny.current_period_end * 1000).toLocaleDateString('pt-BR'),
          customerId: customer.id,
          stripeStatus: activeSubscription.status,
          subscriptionId: activeSubscription.id
        });
      } else {
        res.json({
          hasActiveSubscription: false,
          planName: 'Gratuito (Expirado/Cancelado)',
          nextPayment: null,
          customerId: customer.id,
          subscriptions: subscriptions.data
        });
      }
    } catch (error: any) {
      // In case keys are missing or Stripe is unavailable, we gracefully report it
      res.status(200).json({ 
        hasActiveSubscription: false, 
        planName: 'offline (Stripe não configurado)',
        error: error.message
      });
    }
  });

  // 3. Create Stripe Checkout Session for Subscription Billing
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const { email, userId } = req.body;
      if (!email || !userId) {
        res.status(400).json({ error: 'E-mail do usuário e Auth ID são correspondências obrigatórias.' });
        return;
      }

      const stripe = getStripe();
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      let usePriceId = process.env.STRIPE_PRICE_ID || '';

      // Bulletproof auto-provisioning: If developer hasn't set up the Price ID yet, dynamically find or create a recurring product & price
      if (!usePriceId) {
        const products = await stripe.products.list({ limit: 1 });
        let product;
        if (products.data.length > 0) {
          product = products.data[0];
        } else {
          product = await stripe.products.create({
            name: 'Plano Premium Cofre',
            description: 'Sincronização na nuvem do Firebase, backup end-to-end e gerador ilimitado.',
            metadata: { app: 'vaults_app' }
          });
        }

        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
        if (prices.data.length > 0) {
          usePriceId = prices.data[0].id;
        } else {
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: 1990, // R$ 19,90 BRL
            currency: 'brl',
            recurring: { interval: 'month' },
          });
          usePriceId = price.id;
        }
      }

      // Check if Stripe Customer already exists for this email
      let customerId: string;
      const existingCustomers = await stripe.customers.search({
        query: `email:'${email}'`,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
        // Optionally update metadata if userId was missing
        if (!existingCustomers.data[0].metadata?.userId) {
          await stripe.customers.update(customerId, {
            metadata: { userId }
          });
        }
      } else {
        const newCustomer = await stripe.customers.create({
          email,
          metadata: { userId }
        });
        customerId = newCustomer.id;
      }

      // Initiate subscription check-out
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [
          {
            price: usePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${appUrl}?stripe_status=success`,
        cancel_url: `${appUrl}?stripe_status=cancel`,
        metadata: {
          userId,
          email,
        }
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Stripe Checkout Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Create Customer Billing Portal Session
  app.post('/api/stripe/create-portal-session', async (req, res) => {
    try {
      const { customerId } = req.body;
      if (!customerId) {
        res.status(400).json({ error: 'CustomerID do Stripe é requerido para acessar o portal auto-atendimento.' });
        return;
      }

      const stripe = getStripe();
      const appUrl = process.env.APP_URL || 'http://localhost:3000';

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: appUrl,
      });

      res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error('Stripe Portal Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Integrate Vite Dev Server middleware in non-production, otherwise serve built SPA index.html
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server starting on port ${PORT}... Ready for transaction payloads.`);
  });
}

startServer();
