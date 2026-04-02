import type { NextApiRequest, NextApiResponse } from "next";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";

type ErrorResponse = {
  error: string;
};

type PropertyWithApps = {
  name?: string;
  displayName?: string;
  propertyType?: string;
  appDataStreams: Array<{
    name?: string;
    displayName?: string;
    type?: string;
  }>;
};

function getClient() {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  return new AnalyticsAdminServiceClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PropertyWithApps[] | ErrorResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accountId = req.query.accountId;
  if (!accountId || typeof accountId !== "string") {
    return res.status(400).json({ error: "Missing accountId query param" });
  }

  const client = getClient();
  if (!client) {
    return res.status(500).json({
      error: "Missing GA credentials in environment variables",
    });
  }

  const parent = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;

  try {
    const [properties] = await client.listProperties({
      filter: `parent:${parent}`,
    });

    const safeProperties = properties ?? [];
    const propertiesWithApps = await Promise.all(
      safeProperties.map(async (property) => {
        try {
          const [streams] = await client.listDataStreams({
            parent: property.name ?? "",
          });

          const appDataStreams = (streams ?? [])
            .filter((s) => s.type?.toString().includes("APP_DATA_STREAM"))
            .map((s) => ({
              name: s.name,
              displayName: s.displayName,
              type: s.type?.toString(),
            }));

          return {
            name: property.name,
            displayName: property.displayName,
            propertyType: property.propertyType?.toString(),
            appDataStreams,
          };
        } catch {
          return {
            name: property.name,
            displayName: property.displayName,
            propertyType: property.propertyType?.toString(),
            appDataStreams: [],
          };
        }
      })
    );

    return res.status(200).json(propertiesWithApps);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to fetch properties" });
  }
}
