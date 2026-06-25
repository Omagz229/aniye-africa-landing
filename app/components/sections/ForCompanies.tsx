const audiences = [
  "HR", "People Operations", "Executive Assistants",
  "Founders", "Customer Success", "Partnerships",
];

const moments = [
  { emoji: "🎂", label: "Employee Birthdays" },
  { emoji: "🏆", label: "Work Anniversaries" },
  { emoji: "👋", label: "New Hires" },
  { emoji: "⭐", label: "Promotions" },
  { emoji: "🙏", label: "Farewells" },
  { emoji: "🤝", label: "Client Appreciation" },
  { emoji: "🌍", label: "Partner Gifts" },
  { emoji: "🎁", label: "Executive Gifting" },
  { emoji: "🌟", label: "Seasonal Recognition" },
  { emoji: "💻", label: "Remote Team Moments" },
];

export default function ForCompanies() {
  return (
    <section id="for-companies" className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-3">
            Built for Organizations That Value Their People
          </h2>
          <p className="font-body text-stone text-lg max-w-2xl mx-auto">
            Aniy&eacute; is used by teams responsible for employee experience,
            client relationships, and partner engagement across Africa.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {audiences.map((a) => (
            <span
              key={a}
              className="font-body text-sm font-medium text-ink rounded-full border border-stone/30 px-4 py-2"
            >
              {a}
            </span>
          ))}
        </div>

        <ul
          className="grid grid-cols-2 md:grid-cols-5 gap-3"
          aria-label="Moments Aniyé supports"
        >
          {moments.map((m) => (
            <li
              key={m.label}
              className="flex flex-col items-center text-center gap-2 bg-white rounded-2xl py-6 px-3 border border-stone/15"
            >
              <span className="text-3xl" aria-hidden="true">{m.emoji}</span>
              <span className="font-body text-xs text-ink font-medium leading-snug">
                {m.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
