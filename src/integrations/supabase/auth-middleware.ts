import { createMiddleware } from '@tanstack/react-start';
import { supabase } from './client';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    return next({
      context: {
        supabase,
        userId: "local-user-1",
        claims: { sub: "local-user-1", role: "inspection_manager" },
      },
    });
  }
);
