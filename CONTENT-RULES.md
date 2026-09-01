# Content rules

The rules this site is written to. They are not style preferences — each one
exists because breaking it would mislead a reader, break an agreement with
Amazon, or quietly make the site worse.

Read this before writing an article, adding a product, or accepting help from
anyone (or anything) that offers to write for you.

---

## 1. Never sell against your own copy

This is the rule the others serve. **The words above a product list must be
true of the products in it.**

Two real examples from this site, both caught after the fact:

- The bedroom article asked for "a simple, low bed frame" and praised low
  frames for keeping sightlines open. Every frame in the list underneath was a
  tall upholstered headboard.
- The dining article asked for "real timber" that "takes a scratch as
  character". Five of the six tables listed under it were board or sintered
  stone. The same section said a mismatched set "reads as more considered than
  a matching set bought together" — directly above the only chairs on the site,
  which are a matching set of six.

Neither was a lie about a product. Both were the article arguing with itself,
which is worse: the reader trusts the copy, buys against it, and finds out.

**When copy and product disagree, one of them has to change.** Usually the
copy, because it is the thing that made a promise it had no need to make.

---

## 2. Never prescribe an attribute in a section that carries a list

In a section with a product list, do not tell the reader what **colour**,
**size**, **shape** or **material** the piece should be.

- ❌ "A low, wide sofa in a pale linen"
- ❌ "Round and oval shapes let you seat an extra guest"
- ❌ "Real timber takes a scratch as character"
- ✅ "A sofa is worth settling before anything else"
- ✅ "What the top is made of decides how you live with it. Some surfaces wipe
  clean; others take a mark and keep it as character. Neither is the right
  answer."

Saying *what a piece is for* is fine. Saying *what it must look like* is not,
because the list underneath cannot honour it.

Sections **without** a list are free to be specific — that is where the palette
advice and the styling advice belong.

### Neutral is not the same as vague

Do not strip the writing of judgement to avoid this rule. Bland, tasteless or
hedged copy is a failure, not a safe answer. State the trade-off honestly and
let the reader choose. **Quality of thinking comes first.**

---

## 3. Never name or describe a product in the prose

Product names, brands and specifications live in the list and on the product
page. The article text describes **the room**, never the item.

A reader should be able to ignore every list and still have read something
worth reading.

---

## 4. Say what is not in the box

Amazon listings routinely imply more than they include. Where a reader could
reasonably assume something is included and it is not, the list carries a
`note` saying so.

Real traps found on this site:

| Listing says | What it actually means |
|---|---|
| "No Box Spring Needed" | **Not** that a mattress is included. All five bed frames say this; none include a mattress. |
| Photo shows chairs around the table | "Table only" — one listing says outright the chairs are "for display only" |
| "Mattress Foundation" | A base for a mattress, not the mattress |
| "combine a base with a mattress **of your choice**" | A configuration you must select — the same page may sell the base alone |

**Never promise more than the listing guarantees.** If a listing sells several
configurations, the note says to check which one is selected. If you cannot
verify a claim, do not make it.

The note is rendered inside the list, above the products, so it is read before
anything is clicked. It is edited in the admin panel under the list's label.

---

## 5. A list is inspiration, not an instruction

Every article shows one line before its first list:

> A few pieces in this spirit — inspiration for the look, not a must-buy.
> Choose what suits your space.

Write lists that earn it. Several options that genuinely differ, so the reader
has a real choice — not one product dressed as a recommendation.

---

## 6. Things that never appear

- **No alcohol.** No wine, spirits, beer, cocktails, bar carts, glassware for
  them. Not in copy, not in products, not in images.
- **No sculpture or figurative art of people or living animals** — anywhere,
  including wall art. Abstract work is fine, and is the thing to reach for when
  wall art is needed.
- **No people in article images.** Product listing photographs may show people;
  that is Amazon's photography, not ours.

---

## 7. Affiliate links

- Links are **Amazon SiteStripe links, stored exactly as Amazon gives them.**
  Never hand-write a link, never tidy one up, never edit the query string.
- The tag must be `homedecorw062-20`. A SiteStripe link also carries
  `linkCode=ll2`, a 32-character `linkId`, and `ref_=as_li_ss_tl`.
- **One product per ASIN.** Check before adding — the ASIN is the `/dp/XXXXXXXXXX`
  part of the link. Two links to the same ASIN are the same product.
- **Never use Amazon's product images.** The Associates agreement does not allow
  it without Product Advertising API access, which needs three qualifying sales
  first. Until then products have no photographs, and the site hides the shop on
  its own rather than showing empty frames.

### Product names

No sizes, no colours. Amazon titles carry both and change them per variant.

- ❌ "Allewie Queen Size Lift Up Hydraulic Storage Bed Frame, Light Beige"
- ✅ "Allewie Lift-Up Storage Bed Frame"

Tell two similar products apart by brand and model, never by size or finish.

---

## 8. Links and addresses never change

A product's `slug` is fixed when it is created and never changes again, even
if the name is rewritten completely. Same for articles. The admin panel
enforces this; do not work around it by deleting and recreating an item.

Editing anything — text, photos, rooms, prices — must leave the slug and the
affiliate link untouched.

---

## 9. Broken products are flagged, not deleted

A product with a problem gets ticked **"Hold this off the site"** in the admin,
with a line saying what is wrong.

Flagging removes it from every article list, the shop, the home page, the
search, its own page and the sitemap — but keeps the record and the reason.
Deleting throws away the reason, and the same bad product gets added again six
months later.

Article references are left in place on purpose: the lists simply render
shorter, and unticking the box puts the product back where it was.

They are listed under **Needs attention** in the admin, and at the bottom of
`CATALOGUE.md`.

---

## 10. Verify before you publish

Anything stated as fact about a product must come from the listing itself, not
from the product's category or from what similar products usually do.

When a listing contradicts itself, say neither. One mattress here gives its
firmness as "Medium Plush Feel" in the title and "Medium Firm" in the
specification table — so its description states no firmness at all. Picking one
would be deciding on the seller's behalf.

---

## After any CSS or JS change

Bump the `?v=` number on `style.css`, `main.js`, `admin.css` and `admin.js` in
every HTML file, or visitors keep the old cached copy. They must all match.

```
node -e "var fs=require('fs');fs.readdirSync('.').filter(f=>/\.html$/.test(f)).forEach(f=>{var s=fs.readFileSync(f,'utf8');fs.writeFileSync(f,s.replace(/\?v=50/g,'?v=51'))})"
```

Then regenerate the derived files:

```
node scripts/generate-sitemap.js && node scripts/generate-catalogue.js
```

Both also run automatically on push, via `.github/workflows/sitemap.yml`.
