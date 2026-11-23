import { describe, expect, it, vi } from "vitest";

import { PreviewIndex, artistRank, audioUrl, coverUrl, expandTrack, searchTracks, tracksFor } from "../src/itunes";

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

/** A fake iTunes: an artist search, then a song lookup. */
function fakeItunes(artists: object[], songs: object[]) {
  return vi.fn((url: string) => Promise.resolve(json({ results: url.includes("search?") ? artists : songs })));
}

const song = (track: string) => ({
  wrapperType: "track",
  trackName: track,
  collectionName: "Album",
  previewUrl: `https://audio/${track}.m4a`,
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
});

describe("itunes", () => {
  it("expands shortened URLs", () => {
    expect(audioUrl("AudioPreview1/a.m4a")).toBe(
      "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/a.m4a",
    );
    expect(audioUrl("https://other/a.m4a")).toBe("https://other/a.m4a");
    expect(coverUrl("3|Music1/c.jpg", 600)).toBe("https://is3-ssl.mzstatic.com/image/thumb/Music1/c.jpg/600x600bb.jpg");
    expect(coverUrl("https://x/100x100bb.jpg", 600)).toBe("https://x/600x600bb.jpg");
    expect(expandTrack(["a.m4a", "Song", "Album", null], 100).art).toBe("");
  });

  it("ranks metal artists first and ignores unrelated genres", () => {
    expect(artistRank({ artistId: 1, artistName: "", primaryGenreName: "Heavy Metal" })).toBe(2);
    expect(artistRank({ artistId: 1, artistName: "", primaryGenreName: "Hard Rock" })).toBe(1);
    expect(artistRank({ artistId: 1, artistName: "", primaryGenreName: "Pop" })).toBe(0);
  });

  it("live search takes the exact-name metal artist, without repeated songs", async () => {
    const fetchFn = fakeItunes(
      [
        { artistId: 1, artistName: "Nevermore", primaryGenreName: "Pop" },
        { artistId: 2, artistName: "Nevermore", primaryGenreName: "Metal" },
        { artistId: 3, artistName: "Nevermore Tribute", primaryGenreName: "Metal" },
      ],
      [song("Enemies of Reality"), song("Enemies of Reality"), { wrapperType: "collection" }],
    );
    const tracks = await searchTracks("Nevermore", null, fetchFn);
    expect(fetchFn).toHaveBeenLastCalledWith(expect.stringContaining("id=2"));
    expect(tracks.map((t) => t.title)).toEqual(["Enemies of Reality"]);
  });

  it("live search skips artists taken by verified bands", async () => {
    const fetchFn = fakeItunes([{ artistId: 2, artistName: "Nevermore", primaryGenreName: "Metal" }], [song("x")]);
    expect(await searchTracks("Nevermore", new Set([2]), fetchFn)).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("uses verified previews, knows bands without any, and searches the rest", async () => {
    const previews = PreviewIndex.from({ t: { "44": [["a.m4a", "Song", "Album", null]] }, none: [15125], taken: [9] });
    const fetchFn = fakeItunes([], []);
    expect((await tracksFor("Nevermore", 44, previews, fetchFn)).map((t) => t.title)).toEqual(["Song"]);
    expect(await tracksFor("Nevermore", 15125, previews, fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    await tracksFor("Unique Band", 777, previews, fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
