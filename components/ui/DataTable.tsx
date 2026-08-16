import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Shown as the single surviving metric in the <768px stacked-card view — exactly one column per table should set this. */
  mobilePrimary?: boolean;
}

/**
 * Responsive table/stacked-card pair — docs/product-design/RESPONSIVE_AND_MOBILE_SPECIFICATION.md
 * §5. Renders a real <table> at ≥768px and switches to MobileCardList below
 * it via Tailwind's md: breakpoint, so both markups ship and CSS picks one —
 * no client-side viewport detection needed.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-sx-md border border-sx-border md:block">
        <table className="w-full min-w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-sx-surface-2">
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3.5 py-2.5 text-left font-sx-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-sx-text-subtle">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-t border-sx-border ${onRowClick ? "cursor-pointer hover:bg-sx-surface-1" : ""}`}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3.5 py-2.5 ${i === 0 ? "text-sx-text font-medium" : "text-sx-text-muted"}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MobileCardList columns={columns} rows={rows} onRowClick={onRowClick} />
    </>
  );
}

/** <768px stacked-card view: title + status chip + one metric, per the responsive spec — used directly, or via DataTable's built-in pairing. */
export function MobileCardList<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
}) {
  const [primary, ...rest] = columns;
  const secondary = columns.find((c) => c.mobilePrimary) ?? columns[1];
  return (
    <div className="flex flex-col gap-2 md:hidden">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3 text-left transition-colors hover:bg-sx-surface-2"
        >
          <div className="min-w-0 flex-1 text-[13px] font-medium text-sx-text break-words">
            {primary?.render(row)}
          </div>
          {secondary && (
            <div className="shrink-0 text-[11.5px] text-sx-text-muted">
              {secondary.render(row)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
