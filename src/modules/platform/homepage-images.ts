// Homepage image slots are independent of the editable marketplace taxonomy.
export const homepageCategories = {
  desktop: [
    { key: "hair", label: "Hair", image: "/images/categories/hair-v2.webp" },
    { key: "nails", label: "Nails", image: "/images/categories/nails-v2.webp" },
    {
      key: "barber",
      label: "Barber",
      image: "/images/categories/barber-v2.webp",
    },
    {
      key: "waxing",
      label: "Waxing",
      image: "/images/categories/waxing-v2.webp",
    },
    {
      key: "injectables",
      label: "Injectables",
      image: "/images/categories/injectables-v2.webp",
    },
  ],
  mobile: [
    {
      key: "hair",
      label: "Hair",
      image:
        "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=240&q=82",
    },
    {
      key: "nails",
      label: "Nails",
      image:
        "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=240&q=82",
    },
    {
      key: "lashes",
      label: "Lashes",
      image:
        "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=240&q=82",
    },
    {
      key: "skin",
      label: "Skin",
      image:
        "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=240&q=82",
    },
    {
      key: "makeup",
      label: "Makeup",
      image:
        "https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=240&q=82",
    },
  ],
} as const;

export type HomepageImageDevice = keyof typeof homepageCategories;
export type HomepageCategoryImages = {
  desktop?: Partial<
    Record<(typeof homepageCategories.desktop)[number]["key"], string | null>
  >;
  mobile?: Partial<
    Record<(typeof homepageCategories.mobile)[number]["key"], string | null>
  >;
};
export type HomepageMedia = {
  desktopHero: string | null;
  mobileHero: string | null;
  categoryImages?: HomepageCategoryImages;
  categoryNames?: HomepageCategoryNames;
};

export function categoryImage(
  images: HomepageCategoryImages | undefined,
  device: HomepageImageDevice,
  slot: { key: string; image: string },
) {
  const value = (
    images?.[device] as Record<string, string | null> | undefined
  )?.[slot.key];
  return value || slot.image;
}

// Names and images share stable slot keys; renaming keeps the selected image.
export type HomepageCategoryNames = HomepageCategoryImages;
export function categoryName(
  names: HomepageCategoryNames | undefined,
  device: HomepageImageDevice,
  slot: { key: string; label: string },
) {
  return (
    (names?.[device] as Record<string, string | null> | undefined)?.[
      slot.key
    ] || slot.label
  );
}
