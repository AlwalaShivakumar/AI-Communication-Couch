"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Communication Coach" },
    { href: "/interview", label: "Interview Prep" },
    { href: "/insights", label: "Insights" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <nav className="flex gap-6 text-sm font-medium">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`transition-colors py-1 ${
              isActive
                ? "text-white font-bold border-b-2 border-amber-500"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
