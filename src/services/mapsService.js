const { mapsApiKey } = require("../config/env");

const GOOGLE_GEOCODE_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";

async function geocodeAddress(address) {
  if (!mapsApiKey) {
    throw new Error("Falta MAPS_API_KEY para validar direcciones.");
  }

  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set("address", String(address || "").trim());
  url.searchParams.set("key", mapsApiKey);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Error consultando Google Maps: ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();

  if (payload.status !== "OK" || !Array.isArray(payload.results)) {
    return {
      ok: false,
      status: payload.status || "UNKNOWN_ERROR",
      result: null,
    };
  }

  const firstResult = payload.results[0];

  return {
    ok: true,
    status: payload.status,
    result: {
      formattedAddress: firstResult.formatted_address || null,
      location: {
        lat: firstResult.geometry?.location?.lat ?? null,
        lng: firstResult.geometry?.location?.lng ?? null,
      },
      locationType: firstResult.geometry?.location_type || null,
      partialMatch: Boolean(firstResult.partial_match),
      placeId: firstResult.place_id || null,
      addressComponents: Array.isArray(firstResult.address_components)
        ? firstResult.address_components
        : [],
      types: Array.isArray(firstResult.types) ? firstResult.types : [],
    },
  };
}

module.exports = {
  geocodeAddress,
};
