import { NextResponse } from "next/server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { z } from "zod";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  const client = await pool.connect();

  try {
    const body = await req.json();
    const parsed = SignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const displayName = parsed.data.displayName?.trim() || null;

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const userRes = await client.query(
      `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email
      `,
      [email, passwordHash]
    );

    const userId = userRes.rows[0].id;

    await client.query(
      `
      INSERT INTO user_profiles (user_id, display_name, alert_email)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        alert_email = EXCLUDED.alert_email,
        updated_at = now()
      `,
      [userId, displayName, email]
    );

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch { }
    console.error("POST /api/auth/signup failed:", err);
    return NextResponse.json(
      { ok: false, error: "Signup failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}