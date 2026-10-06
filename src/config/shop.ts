export const SHOP = {
  name: "FitStyle AI Boutique",                            // TODO real shop name
  address: "40 Boulevard Haussmann, 75009 Paris, France",  // TODO demo address
  phone: "+33 1 00 00 00 00",                              // TODO
  hours: "Mon-Sat 10 AM - 8 PM",                           // TODO
  lat: 48.8738,                                            // TODO demo (Paris 9e)
  lng: 2.332,                                              // TODO demo (Paris 9e)
};

// Opens Google Maps with a pin on the shop (works on phone and desktop, no API key)
// The map is found by ADDRESS so Google shows the actual named place.
// lat/lng are only a fallback if the address is empty.
const mapQuery = () =>
  SHOP.address.trim() ? encodeURIComponent(SHOP.address) : `${SHOP.lat},${SHOP.lng}`;

export const mapsLink = () =>
  `https://www.google.com/maps/search/?api=1&query=${mapQuery()}`;

// Free embeddable map for the web page (no API key)
export const mapsEmbed = () =>
  `https://maps.google.com/maps?q=${mapQuery()}&z=16&output=embed`;
