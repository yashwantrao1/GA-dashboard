import type { NextApiRequest, NextApiResponse } from "next";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<unknown[] | ErrorResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return res.status(500).json({
      error: "Missing GA credentials in environment variables",
    });
  }

  const client = new AnalyticsAdminServiceClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });

  try {
    const [accounts] = await client.listAccounts({});
    return res.status(200).json((accounts ?? []) as unknown[]);
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      code?: number;
      details?: string;
    };

    console.error("GA listAccounts failed:", {
      code: err?.code,
      message: err?.message,
      details: err?.details,
    });

    return res.status(500).json({
      error:
        err?.message ??
        "Failed to fetch accounts. Ensure service account has GA account access.",
    });
  }
}
