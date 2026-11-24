# Third-party notices

The root [MIT license](LICENSE) covers original Primogemless code and documentation.
It does not grant ownership of, or relicense, third-party game content, trademarks,
artwork or dependencies. This is an independent fan project, not an official
HoYoverse, Telegram, Enka.Network or Akasha product.

## Game content and artwork

Genshin Impact names, descriptions, icons, character art and other game content
belong to HoYoverse and their respective rights holders. This includes the four
currency PNGs in `assets/currencies/`, game content in the catalogues, third-party
UI elements in the archived tutorial illustrations, and artwork fetched at runtime.
The repository's MIT license does not license that material.

Currency image source URLs are recorded in
[`assets/currencies/sources.json`](assets/currencies/sources.json).
Enka.Network provides static artwork and public showcase data; its API documentation
is at <https://github.com/EnkaNetwork/API-docs>. The icon mapping in
`assets/enka-icons.json` is derived from its public Genshin metadata.
Respect the provider's API rules when using these services.

## Paimon.moe data

The achievement and five-star weapon catalogues are derived from
[Paimon.moe](https://github.com/MadeBaruna/paimon-moe), copyright (c) 2021 Made Baruna,
under MIT. The upstream notice is preserved in
[`assets/PAIMON-MOE-LICENSE.txt`](assets/PAIMON-MOE-LICENSE.txt).
That notice does not override the rights in the underlying game content.

## Record formats and dictionary

Wish and achievement import/export follow the
[UIGF and UIAF standards](https://uigf.org/).
The export helper bundles the public item dictionary from
<https://api.uigf.org/dict/genshin/en.json>. Game names and IDs remain attributable
to their respective rights holders; no separate license to game content is claimed.

## Dependencies and integration references

`@resvg/resvg-js` and `pg` are installed through npm, with exact versions and
integrity hashes in `package-lock.json`. Their licenses and transitive dependency
notices remain with their respective packages. Linux fonts come from the operating
system packages named in the Dockerfile and retain those packages' licenses.

[genshin.py](https://github.com/seriaati/genshin.py) documentation and source informed
the unofficial HoYoLAB API integration. Primogemless does not bundle that library.
Akasha rankings are opened as website links; no Akasha client library is bundled.
