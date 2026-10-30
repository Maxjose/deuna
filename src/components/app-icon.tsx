export function AppIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    package: "m12 3 9 5v8l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 14h2M14 14h2M8 18h2",
    moto: "M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 17l4-7h5l5 7M9 10l4 7H5M14 10l-2-5h4M7 7h3",
    ride: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    history: "M3 12a9 9 0 1 0 3-6M3 3v5h5M12 7v5l3 2",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
    drivers:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87",
    account: "M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    refresh: "M20 7a9 9 0 1 0 1 8M21 3v5h-5",
    arrow: "M5 12h14m-6-6 6 6-6 6",
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.home} />
    </svg>
  );
}
