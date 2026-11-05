import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({ title, meta, action }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">{title}</h1>
        {meta ? <div className="text-xs text-mist-400">{meta}</div> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
