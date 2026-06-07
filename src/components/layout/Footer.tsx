import Link from "next/link";

const footerLinks = [
  { label: "Audio Description", href: "#" },
  { label: "Help Centre", href: "#" },
  { label: "Gift Cards", href: "#" },
  { label: "Media Centre", href: "#" },
  { label: "Investor Relations", href: "#" },
  { label: "Jobs", href: "#" },
  { label: "Terms of Use", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Legal Notices", href: "#" },
  { label: "Cookie Preferences", href: "#" },
  { label: "Corporate Information", href: "#" },
  { label: "Contact Us", href: "#" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-netflix-black px-4 py-12 md:px-12 lg:px-16">
      <p className="mb-6 text-netflix-light-gray">
        Questions?{" "}
        <Link href="#" className="underline hover:text-white">
          Contact us
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-4 text-sm text-netflix-light-gray md:grid-cols-4">
        {footerLinks.map((link) => (
          <Link key={link.label} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-netflix-gray">© 2026 Netflix Clone — Personal Use</p>
    </footer>
  );
}
