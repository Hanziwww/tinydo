import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  transitionKey: string;
  children: ReactNode;
  className?: string;
}

export function FadeTransition({ transitionKey, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevKey = useRef(transitionKey);

  useEffect(() => {
    if (transitionKey !== prevKey.current) {
      prevKey.current = transitionKey;
      const el = ref.current;
      if (!el) return;
      el.classList.remove("ft-in");
      void el.offsetWidth;
      el.classList.add("ft-in");
    }
  }, [transitionKey]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
