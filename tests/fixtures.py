"""Fragments with the structure of real Metal Archives pages and lists (trimmed)."""

BAND_PAGE = """
<div id="band_info">
    <h1 class="band_name"><a href="https://www.metal-archives.com/bands/Yngwie_Malmsteen/84">Yngwie Malmsteen</a></h1>
    <div id="band_stats">
        <dl class="float_left">
            <dt>Country of origin:</dt>
            <dd><a href="https://www.metal-archives.com/lists/SE">Sweden</a></dd>
            <dt>Location:</dt>
            <dd>Stockholm (early); Miami, Florida, United States (later)</dd>
            <dt>Status:</dt>
            <dd class="active">Active</dd>
            <dt>Formed in:</dt>
            <dd>1978</dd>
        </dl>
        <dl class="float_right">
            <dt>Genre:</dt>
            <dd>Neoclassical Power Metal/Shred</dd>
            <dt>Themes:</dt>
            <dd>Society, War, Life, Love, Heroism</dd>
            <dt>Current label:</dt>
            <dd><a href="https://www.metal-archives.com/labels/Rising_Force_Records/1">Rising Force Records</a></dd>
        </dl>
    </div>
    <div class="band_comment clear">
    <!-- Max 400 characters. Open the rest in a dialogue box-->
        Malmsteen's demos brought him to the attention of <a href="https://www.metal-archives.com/labels/Shrapnel_Records/100">Shrapnel Records</a>.<br /><br />Contact: yngwie@example.com
 ... <!-- truncated -->
        <div class="tool_strip bottom right"><a href="#" onclick="readMore('band/read-more/id/84'); return false;" class="btn_read_more">Read more</a></div>
    </div>
</div>
<a class="image" id="logo" href="https://www.metal-archives.com/images/8/4/84_logo.png?2" title="Yngwie Malmsteen"><img></a>
<a class="image" id="photo" href="https://www.metal-archives.com/images/8/4/84_photo.jpg?1" title="Yngwie Malmsteen"><img></a>
<div id="band_tab_members_all">
  <table class="display lineupTable">
    <tr class="lineupHeaders">
        <td colspan="2" align="right">
            Current															</td>
    </tr>
    <tr class="lineupRow">
        <td width="200" valign="top">
            <a href="https://www.metal-archives.com/artists/Yngwie_J._Malmsteen/8024" class="bold">Yngwie J. Malmsteen</a>
        </td>
        <td>
            Guitars&nbsp;(1978-1981, 1984-present), Vocals&nbsp;(2012-present)									</td>
    </tr>
    <tr class="lineupRow">
        <td width="200" valign="top">
            <a href="https://www.metal-archives.com/artists/Nick_Marinovich/185793" class="bold">Nick Marino</a>
        </td>
        <td>
            Keyboards&nbsp;(2005, 2010-present)</td>
    </tr>
    <tr class="lineupHeaders">
        <td colspan="2" align="right">Past</td>
    </tr>
    <tr class="lineupRow">
        <td width="200" valign="top">
            <a href="https://www.metal-archives.com/artists/Jeff_Scott_Soto/2033" class="bold">Jeff Scott Soto</a>
        </td>
        <td>Vocals&nbsp;(1984-1985)</td>
    </tr>
  </table>
</div>
<div id="band_tab_members_live"></div>
"""

NEW_BAND_PAGE = """
<h1 class="band_name"><a href="https://www.metal-archives.com/bands/Saraksh/3540593445">Saraksh</a></h1>
<dl class="float_left">
    <dt>Country of origin:</dt>
    <dd><a href="https://www.metal-archives.com/lists/DE">Germany</a></dd>
    <dt>Location:</dt>
    <dd>N/A</dd>
    <dt>Status:</dt>
    <dd class="active">Active</dd>
    <dt>Formed in:</dt>
    <dd>N/A</dd>
</dl>
<dl class="float_right">
    <dt>Genre:</dt>
    <dd>Crust Punk (early); Progressive Sludge/Groove Metal (later)</dd>
    <dt>Themes:</dt>
    <dd>N/A</dd>
    <dt>Current label:</dt>
    <dd>Unsigned/independent</dd>
</dl>
<div class="band_comment clear">
<!-- Max 400 characters. Open the rest in a dialogue box-->
    </div>
</div>
"""

DISCOGRAPHY_PAGE = """
<table class="display discog">
<tbody>
    <tr>
        <td><a href="https://www.metal-archives.com/albums/Yngwie_Malmsteen/Powerhouse/280100" class="demo">Powerhouse</a></td>
        <td class="demo">Demo</td>
        <td class="demo">1978</td>
        <td></td>
    </tr>
    <tr>
        <td><a href="https://www.metal-archives.com/albums/Yngwie_Malmsteen/Rising_Force/313" class="album">Rising Force</a></td>
        <td class="album">Full-length</td>
        <td class="album">1984</td>
        <td><a href="https://www.metal-archives.com/reviews/Yngwie_Malmsteen/Rising_Force/313/">13 (82%)</a></td>
    </tr>
    <tr>
        <td><a href="https://www.metal-archives.com/albums/Yngwie_Malmsteen/Trilogy_%26_Co/999" class="album">Trilogy &amp; Co</a></td>
        <td class="album">EP</td>
        <td class="album">1986</td>
        <td></td>
    </tr>
</tbody>
</table>
"""

# a row of a review list (by date): [date, review link, band, album, rating, user, time]
REVIEW_ROW = [
    "November 21",
    '<a href="https://www.metal-archives.com/reviews/Mercyful_Fate/Melissa/745/Thrashstalker/950635" title="The heavy-extreme hybrid" class="iconContainer"><span>Read</span></a>',
    '<a href="https://www.metal-archives.com/bands/Mercyful_Fate/182">Mercyful Fate</a>',
    '<a href="https://www.metal-archives.com/albums/Mercyful_Fate/Melissa/745">Melissa</a>',
    "100%",
    '<a href="https://www.metal-archives.com/users/Thrashstalker" class="profileMenu">Thrashstalker</a>',
    "13:11",
]

# a row of "What's updated": [day, band, country, genre, time, user]
CHANGE_ROW = [
    "November 22",
    '<a href="https://www.metal-archives.com/bands/Yngwie_Malmsteen/84">Yngwie Malmsteen</a>',
    '<a href="https://www.metal-archives.com/lists/SE">Sweden</a>',
    "Neoclassical Power Metal/Shred",
    "Nov 22nd, 02:48",
    '<a href="https://www.metal-archives.com/users/cepit" class="profileMenu">cepit</a>',
]

# the name cell of an advanced-search result
SEARCH_NAME_CELL = (
    '<a href="https://www.metal-archives.com/bands/Yngwie_Malmsteen/84">Yngwie Malmsteen</a> '
    "(<strong>a.k.a.</strong> Yngwie J. Malmsteen's Rising Force, Rising Force) <!-- 12.30497 -->"
)
