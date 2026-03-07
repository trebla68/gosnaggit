import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { z } from "zod";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(raw) {
        const parsed = SignInSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const password = parsed.data.password;

        const { rows } = await pool.query(
          `
          SELECT
            u.id,
            u.email,
            u.password_hash,
            up.display_name
          FROM users u
          LEFT JOIN user_profiles up ON up.user_id = u.id
          WHERE LOWER(u.email) = LOWER($1)
          LIMIT 1
          `,
          [email]
        );

        const user = rows[0];
        if (!user?.password_hash) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.display_name ?? null,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },
});