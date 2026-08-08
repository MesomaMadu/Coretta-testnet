"use client";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-black/10 bg-[#F5F5F5] px-6 py-10">
      <div className="mx-auto flex max-w-[88rem] flex-col items-center gap-3 text-center">
        <p className="text-xs text-black/50">© {year} Coretta. All rights reserved.</p>
      </div>
    </footer>
  );
}
