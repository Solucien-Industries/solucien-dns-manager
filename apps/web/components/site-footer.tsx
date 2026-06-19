import { DOCS_URL } from "@/lib/api";
import { PLATFORM_NAMESERVERS } from "@/lib/dns-utils";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-panel">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div>
          <p className="font-semibold">Nani DNS</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Authoritative DNS, SMTP relay, and workspace management for African ccTLDs and global domains.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PLATFORM_NAMESERVERS.map((ns) => (
              <code key={ns} className="rounded border border-border bg-background px-2 py-1 text-xs">
                {ns}
              </code>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>Domain & zone management</li>
            <li>DNS record editor</li>
            <li>SMTP relay & delivery</li>
            <li>Monitoring & metrics</li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Resources</p>
          <ul className="mt-3 grid gap-2 text-sm">
            <li>
              <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                API documentation
              </a>
            </li>
            <li>
              <a href={`${DOCS_URL}/smtp`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                SMTP setup guide
              </a>
            </li>
            <li>
              <a href={`${DOCS_URL}/domains`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                Domain delegation
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Nani DNS. Built for Solucien infrastructure.</p>
          <p>PowerDNS · OAuth identity · Multi-tenant workspaces</p>
        </div>
      </div>
    </footer>
  );
}
