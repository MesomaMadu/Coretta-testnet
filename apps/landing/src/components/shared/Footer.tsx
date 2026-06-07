export default function Footer() {
  return (
    <footer className="border-t border-[var(--ar-border)] px-4 py-8 text-center md:px-8">
      <p className="text-xs text-[var(--ar-fg-subtle)]">
        © {new Date().getFullYear()} Coretta. All rights reserved.
      </p>
    </footer>
  );
}
