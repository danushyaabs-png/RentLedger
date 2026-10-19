// Find a home: search and filters at the top, then the matching homes.

import { useMemo, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { toWei } from "../utils";
import { useFavorites, useListings } from "../listings";
import PropertyCard from "./PropertyCard";
import { PropertyDialogs } from "./PropertyModals";

export default function FindHome() {
  const { data, loading, error, isMine } = useListings();
  const { isSaved, toggle } = useFavorites();
  const [viewing, setViewing] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const homes = useMemo(() => applyFilters(data || [], filters), [data, filters]);
  const cities = useMemo(() => cityList(data || []), [data]);
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <section className="page section">
      <header className="page-head">
        <h1>Find a home</h1>
        <p>Search available rental properties on Ethereum (Sepolia).</p>
      </header>

      <Filters filters={filters} setFilters={setFilters} cities={cities} active={active} />

      {loading && !data && <p className="muted">Loading homes…</p>}
      {error && <p className="error-text">Couldn't reach the Sepolia network. Check your connection and refresh.</p>}

      {data && (
        <div className="results-head">
          <h2 aria-live="polite">
            {homes.length} {homes.length === 1 ? "home" : "homes"} found
          </h2>
          <p className="muted small">Prices are per month, in ETH.</p>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="empty">
          <p>No homes are listed right now.</p>
          <p className="muted">New listings appear here as soon as landlords add them.</p>
        </div>
      )}
      {data && data.length > 0 && homes.length === 0 && (
        <div className="empty">
          <p>No homes match these filters.</p>
          <button className="btn btn-outline" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </div>
      )}

      <div className="grid">
        {homes.map((p) => (
          <PropertyCard
            key={String(p.id)}
            p={p}
            mine={isMine(p)}
            onOpen={() => setViewing(p)}
            saved={isSaved(p.id)}
            onToggleSave={() => toggle(p.id)}
          />
        ))}
      </div>

      <PropertyDialogs viewing={viewing} setViewing={setViewing} isMine={isMine} />
    </section>
  );
}

const MAX_RENT_OPTIONS = ["0.00001", "0.0001", "0.001", "0.01", "0.1", "1"];

const EMPTY_FILTERS = { q: "", city: "", maxRent: "", maxDeposit: "", maxLateFee: "", sort: "newest" };

const SORTS = {
  newest: (a, b) => Number(b.id - a.id),
  rentLow: (a, b) => cmp(a.rentPerMonth, b.rentPerMonth),
  rentHigh: (a, b) => cmp(b.rentPerMonth, a.rentPerMonth),
  depositLow: (a, b) => cmp(a.securityDeposit, b.securityDeposit),
  moveIn: (a, b) => cmp(a.rentPerMonth + a.securityDeposit, b.rentPerMonth + b.securityDeposit),
};

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** City = first part of the location, e.g. "Chennai" from "Chennai, Tamil Nadu". */
function cityOf(location) {
  const first = String(location || "").split(",")[0].trim();
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

function cityList(list) {
  return [...new Set(list.map((p) => cityOf(p.location)).filter(Boolean))].sort();
}

function safeWei(v) {
  try {
    return String(v).trim() ? toWei(v) : null;
  } catch {
    return null;
  }
}

function applyFilters(list, f) {
  const q = f.q.trim().toLowerCase();
  const maxRent = safeWei(f.maxRent);
  const maxDeposit = safeWei(f.maxDeposit);
  const maxFee = f.maxLateFee === "" ? null : Number(f.maxLateFee) * 100;
  return list
    .filter((p) => !q || `${p.name} ${p.location}`.toLowerCase().includes(q))
    .filter((p) => !f.city || cityOf(p.location) === f.city)
    .filter((p) => maxRent === null || p.rentPerMonth <= maxRent)
    .filter((p) => maxDeposit === null || p.securityDeposit <= maxDeposit)
    .filter((p) => maxFee === null || Number.isNaN(maxFee) || Number(p.lateFeeBps) <= maxFee)
    .sort(SORTS[f.sort] || SORTS.newest);
}

function Filters({ filters: f, setFilters, cities, active }) {
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => setFilters({ ...f, [k]: e.target.value });
  return (
    <div className="filters">
      <div className="filters-main">
        <label className="field search">
          <span>Search area, city or property name</span>
          <div className="input-icon">
            <Search size={18} aria-hidden="true" />
            <input type="search" value={f.q} placeholder="Area, city or property name" onChange={set("q")} />
          </div>
        </label>
        <label className="field">
          <span>City</span>
          <select value={f.city} onChange={set("city")}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Max rent <small>(ETH)</small>
          </span>
          <select value={f.maxRent} onChange={set("maxRent")}>
            <option value="">Any</option>
            {MAX_RENT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                Up to {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sort by</span>
          <select value={f.sort} onChange={set("sort")}>
            <option value="newest">Newest first</option>
            <option value="rentLow">Rent: low to high</option>
            <option value="rentHigh">Rent: high to low</option>
            <option value="depositLow">Deposit: low to high</option>
            <option value="moveIn">Lowest move-in cost</option>
          </select>
        </label>
      </div>
      <div className="filters-foot">
        <button className="link-btn with-icon" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal size={16} /> {open ? "Fewer filters" : "More filters"}
          <ChevronDown size={16} className={open ? "flip" : ""} />
        </button>
        {active && (
          <button className="link-btn" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear all
          </button>
        )}
      </div>
      {open && (
        <div className="filters-more">
          <label className="field">
            <span>Max deposit (ETH)</span>
            <input inputMode="decimal" value={f.maxDeposit} placeholder="Any" onChange={set("maxDeposit")} />
          </label>
          <label className="field">
            <span>Max late fee (%)</span>
            <input inputMode="decimal" value={f.maxLateFee} placeholder="Any" onChange={set("maxLateFee")} />
          </label>
        </div>
      )}
    </div>
  );
}
