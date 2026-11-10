import React from "react";
import { HeartPulse } from "lucide-react";
import { human } from "../utils/format";

export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value.toLowerCase()}>{human(value)}</span>;
}

export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}

export function Pager({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (n: number) => void;
  total: number;
}) {
  return (
    <div className="pager">
      <span>
        {total} records · Page {page}
      </span>
      <div>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <div className="eyebrow">{eyebrow ?? "CHAINMED WORKSPACE"}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <HeartPulse size={24} />
      </span>
      <div>
        ChainMed<small>CARE. CONNECTED. PROTECTED.</small>
      </div>
    </div>
  );
}
