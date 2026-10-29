type Icon = (_props: Record<string, unknown>) => unknown;

const icons = import.meta.glob<{ default: Icon }>(
  "/src/assets/icons/socials/*.svg",
  { eager: true }
);

/** Icon for a social, support or share link: src/assets/icons/socials/{name}.svg */
export const getSocialIcon = (name: string) =>
  icons[`/src/assets/icons/socials/${name}.svg`]?.default;
