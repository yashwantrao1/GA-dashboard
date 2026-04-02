import { useEffect, useMemo, useState } from "react";

type Account = {
  name?: string;
  displayName?: string;
  regionCode?: string;
};

type Property = {
  name?: string;
  displayName?: string;
  propertyType?: string;
  appDataStreams?: Array<{
    name?: string;
    displayName?: string;
    type?: string;
  }>;
};

async function fetchPropertiesByAccount(accountName: string) {
  const response = await fetch(
    `/api/ga_properties?accountId=${encodeURIComponent(accountName)}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? "Failed to load properties");
  }

  return Array.isArray(data) ? (data as Property[]) : [];
}

export default function DashboardHeader() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [propertiesByAccount, setPropertiesByAccount] = useState<
    Record<string, Property[]>
  >({});
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [openSelector, setOpenSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefetching, setPrefetching] = useState(false);
  const [error, setError] = useState("");
  const [propertiesError, setPropertiesError] = useState("");

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const response = await fetch("/api/ga_api");
        const data = await response.json();

        if (!response.ok) {
          setError(data?.error ?? "Failed to load accounts");
          return;
        }

        const fetched = Array.isArray(data) ? (data as Account[]) : [];
        setAccounts(fetched);
      } catch {
        setError("Failed to load accounts");
      } finally {
        setLoading(false);
      }
    }

    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!accounts.length) {
      return;
    }

    let cancelled = false;

    async function prefetchAll() {
      setPrefetching(true);
      setPropertiesError("");

      const results = await Promise.allSettled(
        accounts
          .map((account) => account.name)
          .filter((name): name is string => Boolean(name))
          .map(async (accountName) => {
            const properties = await fetchPropertiesByAccount(accountName);
            return { accountName, properties };
          })
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, Property[]> = {};
      let hasError = false;

      for (const result of results) {
        if (result.status === "fulfilled") {
          next[result.value.accountName] = result.value.properties;
        } else {
          hasError = true;
        }
      }

      setPropertiesByAccount(next);
      if (hasError) {
        setPropertiesError("Some account properties could not be prefetched.");
      }
      setPrefetching(false);
    }

    prefetchAll();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  const selectedAccountInfo = useMemo(
    () => accounts.find((account) => account.name === selectedAccount),
    [accounts, selectedAccount]
  );

  const activeAccount = selectedAccount || accounts[0]?.name || "";
  const activeProperties = activeAccount ? propertiesByAccount[activeAccount] : [];

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-6xl p-6">
        <header className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            <button
              type="button"
              onClick={() => setOpenSelector((prev) => !prev)}
              className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>
                {selectedAccountInfo
                  ? selectedAccountInfo.displayName ?? selectedAccountInfo.name
                  : "All accounts"}
              </span>
              <span aria-hidden>▾</span>
            </button>
          </div>

          {(openSelector || (!selectedAccount && !loading)) && (
            <div className="grid border-t border-gray-200 md:grid-cols-[1.2fr_1fr]">
              <section className="border-r border-gray-200">
                <div className="px-4 py-3 text-sm font-medium text-gray-700">
                  Analytics Accounts
                </div>
                {loading && <p className="px-4 pb-4 text-sm text-gray-600">Loading accounts...</p>}
                {error && <p className="px-4 pb-4 text-sm text-red-600">{error}</p>}
                {!loading && !error && (
                  <ul className="divide-y divide-gray-200">
                    {accounts.map((account) => {
                      const isSelected = selectedAccount === account.name;
                      return (
                        <li key={account.name ?? account.displayName}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAccount(account.name ?? "");
                              setOpenSelector(true);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                              isSelected ? "bg-gray-100" : ""
                            }`}
                          >
                            <p className="font-medium text-gray-900">
                              {account.displayName ?? "Unnamed account"}
                            </p>
                            <p className="text-sm text-gray-600">{account.name}</p>
                          </button>
                        </li>
                      );
                    })}
                    {accounts.length === 0 && (
                      <li className="px-4 py-3 text-sm text-gray-600">
                        No accounts found.
                      </li>
                    )}
                  </ul>
                )}
              </section>

              <section>
                <div className="px-4 py-3 text-sm font-medium text-gray-700">
                  Properties & Apps
                </div>
                <div className="px-4 pb-4">
                  {prefetching && !activeProperties && (
                    <p className="text-sm text-gray-600">Prefetching properties...</p>
                  )}
                  {propertiesError && (
                    <p className="mb-2 text-sm text-amber-700">{propertiesError}</p>
                  )}
                  {!activeAccount && (
                    <p className="text-sm text-gray-600">
                      Select an account to view properties.
                    </p>
                  )}
                  {activeAccount && activeProperties?.length === 0 && !prefetching && (
                    <p className="text-sm text-gray-600">No properties found.</p>
                  )}
                  {activeAccount && (activeProperties?.length ?? 0) > 0 && (
                    <ul className="space-y-3">
                      {activeProperties?.map((property) => (
                        <li
                          key={property.name ?? property.displayName}
                          className="rounded-md border border-gray-200 bg-gray-50 p-3"
                        >
                          <p className="font-medium text-gray-900">
                            {property.displayName ?? "Unnamed property"}
                          </p>
                          <p className="text-xs text-gray-600">{property.name}</p>
                          {property.appDataStreams?.length ? (
                            <ul className="mt-2 list-disc pl-4 text-sm text-gray-700">
                              {property.appDataStreams.map((app) => (
                                <li key={app.name ?? app.displayName}>
                                  {app.displayName ?? app.name}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-gray-600">
                              No app streams found.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}
        </header>
      </main>
    </div>
  );
}
