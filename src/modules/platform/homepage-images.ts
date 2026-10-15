// Existing homepage slots retain their names and images; optional links use stable catalogue IDs.
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
export type HomepageCategoryImages = {desktop?:Record<string,string|null>;mobile?:Record<string,string|null>};
export type HomepageCategoryMetadata={desktop?:Record<string,HomepageCategorySlot>;mobile?:Record<string,HomepageCategorySlot>};
export type HomepageCategorySlot={categoryId:string|null;specialityId:string|null;templateId:string|null;description:string;sortOrder:number;visible:boolean};
export type HomepageMedia = {
  desktopHero: string | null;
  mobileHero: string | null;
  categoryMetadata?:HomepageCategoryMetadata;
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

export function homepageCategorySlots(media:Pick<HomepageMedia,"categoryMetadata"|"categoryNames"|"categoryImages">,device:HomepageImageDevice,includeHidden=false){
 const defaults: {key:string;label:string;image:string}[]=[...homepageCategories[device]];
 for(const key of Object.keys(media.categoryMetadata?.[device]??{}))if(!defaults.some(s=>s.key===key))defaults.push({key,label:media.categoryNames?.[device]?.[key]||"Category",image:media.categoryImages?.[device]?.[key]||"/images/categories/hair-v2.webp"});
 return defaults.map((slot,i)=>({...slot,...media.categoryMetadata?.[device]?.[slot.key],sortOrder:media.categoryMetadata?.[device]?.[slot.key]?.sortOrder??i*10})).filter(slot=>includeHidden||slot.visible!==false).sort((a,b)=>a.sortOrder-b.sortOrder);
}
export function homepageCategoryHref(media:HomepageMedia,device:HomepageImageDevice,key:string,label:string){const m=media.categoryMetadata?.[device]?.[key];const q=new URLSearchParams();if(m?.categoryId)q.set("categoryId",m.categoryId);if(m?.specialityId)q.set("specialityId",m.specialityId);if(m?.templateId)q.set("templateId",m.templateId);if(!q.size)return `/explore?q=${encodeURIComponent(label)}`;return `/explore?${q}`;}
