import { useEffect, useMemo, useState } from "react";

import type { ComparePairState } from "@/lib/compare-state";

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

const SELECTED_ACCOUNT_CACHE_KEY = "ga:selectedAccount";
const SELECTED_PROPERTY_CACHE_KEY = "ga:selectedProperty";

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

function findPropertySnapshot(
  propertyResourceName: string,
  byAccount: Record<string, Property[]>
): { propertyLabel: string; apps: string[] } | null {
  for (const list of Object.values(byAccount)) {
    const p = list.find((x) => (x.name ?? "") === propertyResourceName);
    if (p) {
      const apps = (p.appDataStreams ?? [])
        .map((a) => (a.displayName ?? a.name ?? "").trim())
        .filter(Boolean);
      return {
        propertyLabel: p.displayName ?? p.name ?? propertyResourceName,
        apps,
      };
    }
  }
  return null;
}

export type DashboardHeaderProps = {
  comparePair?: ComparePairState;
  onComparePairChange?: (next: ComparePairState) => void;
};

export default function DashboardHeader({
  comparePair = null,
  onComparePairChange = () => {},
}: DashboardHeaderProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [propertiesByAccount, setPropertiesByAccount] = useState<
    Record<string, Property[]>
  >({});
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [openSelector, setOpenSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefetching, setPrefetching] = useState(false);
  const [error, setError] = useState("");
  const [propertiesError, setPropertiesError] = useState("");
  const [primarySnap, setPrimarySnap] = useState<{
    propertyLabel: string;
    apps: string[];
  } | null>(null);
  const [secondarySnap, setSecondarySnap] = useState<{
    propertyLabel: string;
    apps: string[];
  } | null>(null);

  useEffect(() => {
    const cachedAccount = window.localStorage.getItem(SELECTED_ACCOUNT_CACHE_KEY);
    const cachedProperty = window.localStorage.getItem(SELECTED_PROPERTY_CACHE_KEY);
    if (cachedAccount) {
      setSelectedAccount(cachedAccount);
    }
    if (cachedProperty) {
      setSelectedProperty(cachedProperty);
    }
  }, []);

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
    if (!selectedAccount) {
      window.localStorage.removeItem(SELECTED_ACCOUNT_CACHE_KEY);
    } else {
      window.localStorage.setItem(SELECTED_ACCOUNT_CACHE_KEY, selectedAccount);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (!selectedProperty) {
      window.localStorage.removeItem(SELECTED_PROPERTY_CACHE_KEY);
    } else {
      window.localStorage.setItem(SELECTED_PROPERTY_CACHE_KEY, selectedProperty);
      window.dispatchEvent(
        new CustomEvent("ga:selectedPropertyChanged", {
          detail: { property: selectedProperty },
        })
      );
    }
  }, [selectedProperty]);

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

  useEffect(() => {
    if (!accounts.length || !selectedAccount) {
      return;
    }

    const stillExists = accounts.some((account) => account.name === selectedAccount);
    if (!stillExists) {
      setSelectedAccount("");
    }
  }, [accounts, selectedAccount]);

  /** While choosing the second property, require an explicit account pick (no default). */
  const activeAccount = useMemo(() => {
    if (!comparePair) {
      return selectedAccount || accounts[0]?.name || "";
    }
    if (comparePair.secondary === null) {
      return selectedAccount;
    }
    return selectedAccount || accounts[0]?.name || "";
  }, [comparePair, selectedAccount, accounts]);

  const activeProperties = activeAccount ? propertiesByAccount[activeAccount] : [];

  function handleCompareClick() {
    if (comparePair) {
      setPrimarySnap(null);
      setSecondarySnap(null);
      onComparePairChange(null);
      return;
    }
    if (!selectedProperty) {
      return;
    }
    const snap = findPropertySnapshot(selectedProperty, propertiesByAccount);
    setPrimarySnap(
      snap ?? {
        propertyLabel: selectedProperty.replace(/^properties\//, ""),
        apps: [],
      }
    );
    setSecondarySnap(null);
    setSelectedAccount("");
    onComparePairChange({ primary: selectedProperty, secondary: null });
  }

  function handlePropertySelect(propName: string) {
    if (comparePair && comparePair.secondary === null) {
      if (propName === comparePair.primary) {
        return;
      }
      const snap = findPropertySnapshot(propName, propertiesByAccount);
      setSecondarySnap(
        snap ?? {
          propertyLabel: propName.replace(/^properties\//, ""),
          apps: [],
        }
      );
      onComparePairChange({ primary: comparePair.primary, secondary: propName });
      setSelectedProperty(propName);
      return;
    }
    setSelectedProperty(propName);
  }

  const accountButtonLabel =
    comparePair && comparePair.secondary === null && !selectedAccountInfo
      ? "Select account"
      : selectedAccountInfo
        ? selectedAccountInfo.displayName ?? selectedAccountInfo.name
        : "All accounts";

  const selectedPropertyLabel = useMemo(() => {
    if (!selectedProperty) {
      return null;
    }
    const snap = findPropertySnapshot(selectedProperty, propertiesByAccount);
    return snap?.propertyLabel ?? selectedProperty.replace(/^properties\//, "");
  }, [selectedProperty, propertiesByAccount]);

  const showCompareChips = comparePair && primarySnap;

  return (
    <div className="">
      <main className="mx-auto max-w-6xl p-6">
        <header className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            <div className="flex min-w-0 max-w-full flex-1 items-center justify-end gap-3 sm:min-w-[280px]">
              {showCompareChips ? (
                <div
                  className="min-w-0 max-w-[min(52vw,28rem)] truncate text-right text-xs text-gray-700 md:text-sm"
                  title={
                    secondarySnap
                      ? `${primarySnap.propertyLabel}${primarySnap.apps.length ? ` · ${primarySnap.apps.join(", ")}` : ""} | ${secondarySnap.propertyLabel}${secondarySnap.apps.length ? ` · ${secondarySnap.apps.join(", ")}` : ""}`
                      : `${primarySnap.propertyLabel}${primarySnap.apps.length ? ` · ${primarySnap.apps.join(", ")}` : ""}`
                  }
                >
                  <span className="font-medium text-gray-900">
                    {primarySnap.propertyLabel}
                  </span>
                  {primarySnap.apps.length > 0 ? (
                    <span className="text-gray-600">
                      {" "}
                      · {primarySnap.apps.join(", ")}
                    </span>
                  ) : null}
                  {secondarySnap ? (
                    <>
                      <span className="mx-1.5 font-normal text-gray-400">|</span>
                      <span className="font-medium text-gray-900">
                        {secondarySnap.propertyLabel}
                      </span>
                      {secondarySnap.apps.length > 0 ? (
                        <span className="text-gray-600">
                          {" "}
                          · {secondarySnap.apps.join(", ")}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenSelector((prev) => !prev)}
                className="flex min-w-0 max-w-56 shrink items-start gap-2 rounded-md border border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 sm:max-w-64"
                title={
                  selectedPropertyLabel
                    ? `${accountButtonLabel} — ${selectedPropertyLabel}`
                    : accountButtonLabel
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate leading-tight">
                    {accountButtonLabel}
                  </span>
                  {selectedPropertyLabel ? (
                    <span className="mt-0.5 block truncate text-xs font-normal leading-tight text-gray-600">
                      {selectedPropertyLabel}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 pt-0.5 text-gray-500" aria-hidden>
                  ▾
                </span>
              </button>
              <button
                type="button"
                onClick={handleCompareClick}
                disabled={!comparePair && !selectedProperty}
                title={
                  !comparePair && !selectedProperty
                    ? "Select a property first"
                    : comparePair
                      ? "Exit compare mode"
                      : "Compare: pin property & clear account"
                }
                className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {comparePair ? "Exit compare" : "Compare"}
              </button>
            </div>
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
                      {comparePair && comparePair.secondary === null
                        ? "Select an account, then choose a second property (not the pinned one)."
                        : "Select an account to view properties."}
                    </p>
                  )}
                  {activeAccount && activeProperties?.length === 0 && !prefetching && (
                    <p className="text-sm text-gray-600">No properties found.</p>
                  )}
                  {activeAccount && (activeProperties?.length ?? 0) > 0 && (
                    <ul className="space-y-3">
                      {activeProperties?.map((property) => {
                        const propName = property.name ?? "";
                        const isSelected = selectedProperty === propName;
                        const isPrimaryLocked =
                          Boolean(
                            comparePair &&
                              comparePair.secondary === null &&
                              propName === comparePair.primary
                          );
                        return (
                          <li
                            key={property.name ?? property.displayName}
                            className={`rounded-md border p-3 ${
                              isSelected
                                ? "border-blue-500 bg-blue-50"
                                : isPrimaryLocked
                                  ? "border-gray-200 bg-gray-100 opacity-70"
                                  : "border-gray-200 bg-gray-50"
                            }`}
                          >
                            <button
                              type="button"
                              disabled={isPrimaryLocked}
                              onClick={() => handlePropertySelect(propName)}
                              className="w-full text-left disabled:cursor-not-allowed"
                            >
                              <p className="font-medium text-gray-900">
                                {property.displayName ?? "Unnamed property"}
                              </p>
                              <p className="text-xs text-gray-600">
                                {property.name}
                                {isSelected ? " (selected)" : ""}
                                {isPrimaryLocked ? " — pinned for compare" : ""}
                              </p>
                            </button>
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
                        );
                      })}
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
