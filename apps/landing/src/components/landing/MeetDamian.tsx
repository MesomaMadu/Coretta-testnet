"use client";



import { motion, useInView } from "framer-motion";

import { useRef } from "react";

import SectionShell from "@/components/shared/SectionShell";

import { fadeUpItem, loopSlow, springSmooth, staggerContainer } from "@/lib/motion";



const HIGHLIGHTS = [

  {

    title: "AI Transaction Assistant",

    desc: "Natural language transaction building with full user confirmation.",

  },

  {

    title: "Smart Wallet Infrastructure",

    desc: "Account abstraction removes the need for users to understand wallet mechanics.",

  },

  {

    title: "Instant Settlement",

    desc: "Built around high-performance blockchain infrastructure for near-instant execution.",

  },

  {

    title: "User-Controlled Security",

    desc: "Every transaction remains transparent, reviewable, and cryptographically authorized by the user.",

  },

] as const;



function HighlightCard({

  title,

  desc,

  index,

}: {

  title: string;

  desc: string;

  index: number;

}) {

  const ref = useRef(null);

  const inView = useInView(ref, { once: false, margin: "-40px" });



  return (

    <motion.article

      ref={ref}

      initial={{ opacity: 0, y: 28, scale: 0.96 }}

      animate={inView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.96 }}

      transition={{ ...springSmooth, delay: index * 0.1 }}

      whileHover={{

        y: -6,

        scale: 1.02,

        boxShadow:

          "0 0 0 1px rgba(0,170,255,0.25), 0 12px 40px rgba(0,0,0,0.45), 0 0 48px rgba(123,47,255,0.18)",

      }}

      className="rounded-2xl border border-[var(--ar-border)] bg-[var(--ar-surface)] p-6 transition-colors duration-300"

    >

      <motion.div

        className="mb-3 h-0.5 w-10 rounded-full bg-gradient-to-r from-[#1A8FFF] to-[#7B2FFF]"

        animate={{ opacity: [0.5, 1, 0.5], scaleX: [0.85, 1, 0.85] }}

        transition={{ ...loopSlow, delay: index * 0.2 }}

      />

      <h3 className="text-base font-semibold text-[var(--ar-fg)]">{title}</h3>

      <p className="mt-2 text-sm leading-relaxed text-[var(--ar-fg-muted)]">{desc}</p>

    </motion.article>

  );

}



export default function MeetDamian() {

  return (

    <SectionShell id="damian" eyebrow="Damian" title="Meet Damian">

      <div className="mx-auto max-w-3xl text-center">

        <p className="text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">

          Damian is Coretta&apos;s transaction intelligence layer.

        </p>

        <p className="mt-6 text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">

          Instead of navigating complex wallet interfaces, users can simply describe what they

          want to do:

        </p>

        <ul className="mx-auto mt-6 max-w-xl space-y-2 text-left text-sm leading-relaxed text-[var(--ar-fg-muted)] md:text-base">

          <li>• Send funds to a wallet address.</li>

          <li>• Transfer assets using an email identity.</li>

          <li>• Convert between supported currencies.</li>

          <li>• Prepare multiple transactions at once.</li>

          <li>• Review and confirm transactions before signing.</li>

        </ul>

        <p className="mt-8 text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">

          Damian never controls user funds and never executes actions autonomously.

        </p>

        <p className="mt-4 text-base leading-relaxed text-[var(--ar-fg-muted)] md:text-lg">

          Every transaction is presented for review and requires explicit user approval,

          keeping users in complete control while reducing the complexity of interacting with

          modern blockchain infrastructure.

        </p>

      </div>



      <motion.div

        variants={staggerContainer}

        initial="hidden"

        whileInView="visible"

        viewport={{ once: false, margin: "-60px" }}

        className="mt-14 grid gap-4 sm:grid-cols-2"

      >

        {HIGHLIGHTS.map((card, i) => (

          <motion.div key={card.title} variants={fadeUpItem}>

            <HighlightCard {...card} index={i} />

          </motion.div>

        ))}

      </motion.div>

    </SectionShell>

  );

}


