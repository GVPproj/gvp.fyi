# S3 region and cost research — #11

**Fetched 2026-10-13 UTC**, using the actual local UTC clock, not dates inferred from existing notes. Initial public HTTP source fetches ran approximately **23:51–23:53 UTC**; the documented extraction was rechecked at approximately **23:55 UTC**. Read-only research: no authenticated AWS calls, resource writes, provisioning, migration, or alert configuration. Only this findings file was added to the repository.

## Recommendation and scope

**Recommend `us-west-1` (Northern California)** for private S3 originals serving the existing Fly backend. The [preflight](../storage-preflight.md) observed the machine and volume in `sjc`; Fly identifies `sjc` as San Jose, California [F]. Northern California is the geographic fit, whereas `us-west-2` is Oregon [S1, S2]. **No latency, throughput, routing, or availability comparison was measured.** Geographic proximity is not proof of faster requests. Oregon remains a reasonable lower-price alternative if future measurements or backend relocation favor it; neither the CLI's Oregon setting nor the Fly configuration's `sea` setting establishes actual placement.

Northern California's premium is $0.003 per GiB-month of Standard storage, $0.0005 per 1,000 write/list requests, and $0.00004 per 1,000 reads. At the modeled workload below, the difference is under $0.004/month even with 1 GiB live storage. This favors geographic suitability over negligible savings at this scale.

This is a recommendation, not provisioning approval or a newly adopted architecture. Preserve the [owner-approved decisions](../publishing-decisions.md): private originals, static Netlify delivery, unchanged MP3s, a **$5/month incremental AWS alert**, and **backups under $1/month inside that $5 total**. Ask before adopting a backup approach estimated at $1/month or more. Latest #11 comments report non-root setup progress beyond the older blocker wording in the decisions file; no account access or permissions were reverified here.

## Primary sources and dating

All sources below were fetched successfully via unauthenticated public HTTPS. The HTML pricing/documentation pages did not establish a clear offer effective/publication date; their evidence date is the fetch date above. JSON dates are provider metadata, not fetch dates and not necessarily when a rate last changed.

| ID | Official source URL | Published version / selected term effective date |
| --- | --- | --- |
| S1 | https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-1/index.json | Version `20261012231102`; published `2026-10-12T23:11:02Z`; selected terms effective `2026-10-01T00:00:00Z` |
| S2 | https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-2/index.json | Same publication, version and selected effective date as S1 |
| D1 | https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/us-west-1/index.json | Version `20260916132208`; published `2026-09-16T13:22:08Z`; selected outbound term effective `2026-06-01T00:00:00Z` |
| D2 | https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/us-west-2/index.json | Same publication, version and selected effective date as D1 |
| P | https://aws.amazon.com/s3/pricing/ | S3 pricing: billing units, transfer exceptions and request categories |
| B1 | https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/ | AWS Budgets pricing |
| B2 | https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html | Budget refresh cadence, notification delays and cost scope |
| B3 | https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html | Forecast history, alert behavior, permissions and SNS prerequisites |
| F | https://fly.io/docs/reference/regions/ | Fly region names; machine placement comes from the project preflight, not this page |

## Verified list prices

USD, ordinary **S3 Standard**, first storage tier, without free-tier credits, discounts or taxes. AWS calls its binary storage unit “GB”: **1 GB = 2^30 bytes = 1 GiB** [P]. Calculations use GiB explicitly; transfer examples likewise divide bytes by 2^30. Full-month average storage is assumed.

| Charge | `us-west-1` | `us-west-2` | Source |
| --- | ---: | ---: | --- |
| Standard storage, first 50 TiB/month | $0.026/GiB-month | $0.023/GiB-month | S1, S2 |
| PUT, COPY, POST, LIST | $0.0055/1,000 | $0.005/1,000 | S1, S2 |
| GET and other Tier-2 requests | $0.00044/1,000 | $0.0004/1,000 | S1, S2 |
| DELETE and CANCEL | $0 | $0 | P |
| Internet data transfer IN to S3 | $0/GiB | $0/GiB | P; S1, S2 inbound terms |
| Internet data transfer OUT, first 10 TiB of paid usage/month | $0.09/GiB | $0.09/GiB | D1, D2; P |
| Internet OUT: next 40 / next 100 / above 150 TiB | $0.085 / $0.070 / $0.050 per GiB | Same | D1, D2 |

Storage's next 450 TiB and above 500 TiB tiers are $0.025/$0.024 in Northern California and $0.022/$0.021 in Oregon [S1, S2]; irrelevant to these scenarios. Standard is modeled rather than IA/Glacier: no archival/retrieval workflow is assumed. Multipart operations, retries, list pagination and checksum/verification reads can increase request counts; a file upload is not necessarily one billable request.

**Transfer extraction pitfall:** S1/S2 contain `AWS Outbound` terms priced at zero. Do **not** interpret those alone as free internet egress. The S3 pricing page's internet transfer table references the separate data-transfer pricing component; D1/D2 contain the paid external outbound tiers above. Relevant outbound SKUs are `AHRNA43Y8M88C9BD` (west-1) and `5M4327XEUKBBTWAT` (west-2).

AWS advertises 100 GB/month internet outbound free, shared across services and regions except China/GovCloud [P]. **Every outbound byte in this note is charged at $0.09/GiB anyway**: neither available allowance nor account eligibility/usage was checked. No new-customer credits or other free-tier assumptions are used. Free ingress and free budget monitoring are published service rates, not assumed promotional eligibility.

Fly and Netlify are external destinations, not same-region AWS services. Budget S3 downloads to Fly/build/recovery systems as internet egress unless the actual path proves an applicable exception. S3 same-region bucket-to-bucket transfer is free of transfer charges [P], but requests/storage still cost money. Copying through Fly can instead incur S3 internet egress plus any Fly transfer charges. Cross-region recovery is a different cost model and is not priced here. Static visitor delivery on Netlify does not imply one S3 GET per visitor; source fetches at publishing/build time still count. Fly/Netlify charges are outside these AWS estimates.

## Explicit live-storage scenarios

Observed inventory: **2,298,167 bytes = 0.002140334807 GiB**, comprising three originals, three thumbnails and six `.attrs` sidecars [preflight](../storage-preflight.md). This is a conservative modeled live object payload, **not** proof that PocketBase will create 12 S3 objects or retain precisely the same byte count. Preserve metadata during recovery. It is not the database size or a complete recovery-set measurement.

Storage alone is **$0.00005565/month in west-1** versus **$0.00004923 in west-2**. One complete download costs **$0.00019263** in either region, excluding requests. Growth to **1 GiB = 1,073,741,824 bytes** costs $0.026/$0.023 storage and $0.09 per complete download.

To expose request and transfer sensitivity, assume each month:

- 1,000 PUT/COPY/POST/LIST requests and 10,000 GET/other Tier-2 requests;
- 30 complete-payload download equivalents (about one per day), distributed among those reads, not an additional 10,000 full downloads;
- no public runtime S3 delivery, acceleration, KMS charges or optional analytics.

These are **illustrative usage assumptions, not observed traffic or a forecast**. Formula: `live cost = S*p + W*w + R*r + E*0.09`, with S in GiB-month, E in GiB, and request rates per individual request.

| Monthly component | Observed bytes, west-1 | Observed bytes, west-2 | 1 GiB, west-1 | 1 GiB, west-2 |
| --- | ---: | ---: | ---: | ---: |
| Live storage | $0.00005565 | $0.00004923 | $0.026000 | $0.023000 |
| 1,000 writes/list | $0.005500 | $0.005000 | $0.005500 | $0.005000 |
| 10,000 reads | $0.004400 | $0.004000 | $0.004400 | $0.004000 |
| 30 downloads: 0.06421004 / 30 GiB | $0.00577890 | $0.00577890 | $2.700000 | $2.700000 |
| **Subtotal, excluding backups/other services/tax** | **$0.01573455** | **$0.01482813** | **$2.735900** | **$2.732000** |

At 1 GiB, 100 full downloads/month would cost **$9 transfer alone**. The $5 alert cannot prevent that. Build/source caching and avoiding unnecessary full fetches matter more than this region price difference.

## Three complete recovery sets: sensitivity, not a backup quote

The policy is three **successful complete** database-and-object recovery sets, with monthly creation, failure notifications and separate pre-change rollback sets. PocketBase backup ZIPs omit S3 files; live object versioning alone is not independent recovery [owner decisions](../publishing-decisions.md). No independent destination, consistent archive, scheduler or restore was verified here.

Let **B** be the actual stored size of one complete set in GiB, including database, all required object files/versions, manifests, code/configuration and securely retained recovery material as applicable. Compression/packaging can change B. Three equal-sized sets held for a whole month cost `3*B*p` in Standard storage. This models a separate recovery copy, not the live originals counted three times and called a backup. Same-region storage pricing does not establish adequate credential/failure-domain isolation.

| Size per complete set B | west-1: three sets | west-2: three sets |
| --- | ---: | ---: |
| Observed object payload alone: 0.002140334807 GiB (**incomplete lower bound**) | $0.00016695 | $0.00014768 |
| Observed objects + assumed 10 MiB non-object recovery payload | $0.00092866 | $0.00082151 |
| 1 GiB objects + assumed 10 MiB non-object recovery payload | $0.07876172 | $0.06967383 |
| 10 GiB complete set | $0.780 | $0.690 |
| 12 GiB complete set | $0.936 | $0.828 |
| 13 GiB complete set | $1.014 | $0.897 |
| 14 GiB complete set | $1.092 | $0.966 |
| 15 GiB complete set | $1.170 | $1.035 |

**10 MiB is an explicit sensitivity assumption, not measured database/archive size.** Both assumed complete-set rows include all recovery components only if that allowance actually suffices. Measure a consistent complete set before adopting automation; historical archives and allocated live-database bytes cannot establish it.

A monthly allowance of 1,000 writes/list plus 10,000 reads costs $0.0099/$0.009; use **$0.01** as a rounded request allowance for sensitivity, not a cap. With that allowance and one complete-set internet export per month (e.g. external verification/recovery), the illustrative backup subtotals are:

| Assumed complete payload | west-1 | west-2 |
| --- | ---: | ---: |
| Observed objects + 10 MiB | $0.01200020/month | $0.01189305/month |
| 1 GiB objects + 10 MiB | $0.17964063/month | $0.17055273/month |

These are storage + request allowance + one exported set, **before scheduler/compute/failure-notification charges, extra exports, retention overlap or tax**. One export is not a validated backup implementation. If creation downloads originals through Fly and verification downloads the backup too, charge both streams. Same-region server-side copying could avoid the creation egress but needs design and access verification. Each additional full export adds `0.09*B`; restoration can produce a spike.

For a steady-state monthly budget, define H as all other backup costs (requests, scheduling, compute, notifications, additional versions, rollback retention, transfer, etc.). The strict under-$1 requirement is:

`3*B*p + H < 1`, so `B < (1-H)/(3*p)` when `0 <= H < 1`.

- Storage-only mathematical ceiling: **B < 12.8205 GiB west-1**, **B < 14.4928 GiB west-2**. These are not operationally safe limits.
- Reserving $0.10/month for everything else: **B < 11.5385 / 13.0435 GiB**, respectively. That reserve is hypothetical, not a verified scheduler/notification quote.
- Charging one complete-set export monthly plus $0.01 requests, but still no scheduler/notification cost: `(3*p+0.09)*B+0.01 < 1`, giving **B < 5.8929 / 6.2264 GiB**. Any other charges lower these thresholds.
- Keep three successful sets while validating the replacement: a fourth set can temporarily coexist. Add time-weighted overlap storage, failed/incomplete uploads and separately retained rollback sets; never delete a good set to force the arithmetic below $1. Four full-month sets alone reduce the storage-only ceiling to **9.6154 / 10.8696 GiB per set**.

**Scheduler, backup compute and failure-notification prices are NOT verified.** No EventBridge/Lambda/SNS/SES/Fly/GitHub Actions free entitlement is assumed. AWS Budgets email pricing below does not price backup failure notifications or detect missing backups. Even a tiny stored payload does not prove the complete automated workflow is under $1.

For context only, the 1 GiB live scenario plus the 1 GiB+10 MiB backup/export scenario is **$2.91554/month west-1** or **$2.90255 west-2**, before these unresolved charges and tax. This is not a guarantee against the approved $5 alert.

## $5 incremental AWS alert: price and limitations

AWS Budgets **monitoring and budget notifications are free of charge** [B1]. Prefer a recurring monthly **cost budget with direct email alerts**, no automated actions or paid report subscription, for the approved $5 incremental AWS notification.

Different products/options must not be conflated [B1]:

- Action-enabled budgets: first two free per month; each additional action-enabled budget **$0.10/day** (e.g. $3 in a 30-day month). Existing usage/eligibility was not inspected and no action-enabled budget is recommended here.
- Budget Reports: **$0.01 per delivered report**, unlike ordinary threshold alerts.
- SNS delivery, backup failure messages and their scheduling/compute are separate services; their rates and account usage were not verified here. Direct Budgets email avoids depending on an SNS-based design for this alert.

Operational limitations [B2, B3]:

- **An alert is not a spending cap.** Billing ingestion and notification lag allow spending to exceed $5 before delivery. B2 says updates occur up to three times a day, typically 8–12 hours apart; B3 says underlying billing data updates at least daily. Neither promises real-time alerts or a maximum overshoot.
- Actual alerts are sent once per budget per budget period upon first reaching the actual threshold; they are not a continuous failure/paging signal. Forecast alerts can recur but require approximately **five weeks of usage history**. Configure actual-spend notification; do not depend on an immediate forecast.
- Up to 10 email addresses and one SNS topic per alert. SNS requires topic permissions and accepted subscription. Destination and real end-to-end delivery remain untested.
- Cost treatment can include/exclude taxes, support, credits, refunds and other charges. Record the chosen treatment; estimates here are pretax list prices with no credits.

**“Incremental” needs verified accounting scope.** A $5 whole-account budget is not automatically a $5 project-increment budget; existing SES and other usage may consume it. Conversely, an S3-only budget can miss scheduler/notification/compute costs. Before authorized setup, identify attributable live storage, backup storage, requests, data transfer and supporting services; verify available cost filters/allocation and compare against billing data. Do not assume tagging the budget itself allocates resource costs (B3 explicitly distinguishes budget tags from cost allocation). If clean isolation is unavailable, agree a baseline-plus-increment/account-wide guardrail with the owner rather than silently changing the approved meaning.

No billing baseline, cost-allocation coverage, budget permissions, recipients, forecast availability or delivery was verified. Scoped storage SSO permissions do not imply billing permissions. Configuration and delivery testing require a separately authorized next step; nothing was configured here.

## Reproducible public price extraction

This standard-library Python script performs only public HTTP GETs and prints catalog dates, SKU, effective date, unit, tier bounds and USD rates. It deliberately selects ordinary request usage types (not annotation requests), excludes Multi-Region Access Point transfer operations, and uses **AWSDataTransfer**, not AmazonS3's zero-valued outbound entries, for internet egress. Run as `python3 - <<'PY'` with the code below and a closing `PY`. `current` moves; compare returned dates/version with this note before reusing numbers.

```python
import datetime
import json
import urllib.request

for region, prefix in [("us-west-1", "USW1"), ("us-west-2", "USW2")]:
    for service in ["AmazonS3", "AWSDataTransfer"]:
        url = ("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/"
               f"{service}/current/{region}/index.json")
        with urllib.request.urlopen(url, timeout=60) as response:
            offer = json.load(response)
        print(datetime.datetime.now(datetime.timezone.utc).isoformat(), url,
              offer["version"], offer["publicationDate"])
        matches = 0
        for sku, product in offer["products"].items():
            a = product["attributes"]
            if service == "AmazonS3":
                selected = a.get("operation") == "" and a.get("usagetype") in {
                    f"{prefix}-TimedStorage-ByteHrs",
                    f"{prefix}-Requests-Tier1",
                    f"{prefix}-Requests-Tier2",
                    f"{prefix}-DataTransfer-In-Bytes",
                }
            else:
                selected = (a.get("transferType") == "AWS Outbound"
                            and a.get("fromRegionCode") == region
                            and a.get("toLocation") == "External")
            if not selected:
                continue
            matches += 1
            for term in offer["terms"]["OnDemand"][sku].values():
                for price in term["priceDimensions"].values():
                    print(sku, a["usagetype"], term["effectiveDate"],
                          price["unit"], price["beginRange"], price["endRange"],
                          price["pricePerUnit"]["USD"], price["description"])
        assert matches == (4 if service == "AmazonS3" else 1), matches
```

Selected storage / write / read SKUs, respectively:

- west-1: `TZP3WS2ZP5WNPJT2` / `CE79BJ8EJA6B9EDP` / `8V7SFTM8C7PGXXJ8`.
- west-2: `Z3FQZG73HYSPVABR` / `D4PMUVH6F64HK2D6` / `E77AQEM2DC4VV3FC`.

SHA-256 of raw fetched JSON responses (for comparison, not an archived source guarantee):

```text
S1 c85f6c83725adc78f1c1bd7fa8468f5537af75e3b09d9e7e5f390d85b223a39a
S2 9f1dc0c5f31ff6e0f2ffe9defdef5f016adb3f33252d686919cfdf266177a765
D1 673031d42ad9aab26e9e9d76059747c5b1a59a349941319bab7302dda3c27fde
D2 1a790516ec9a83f4acaa4987ceb5e804f808cb67cc61293fce13680575a05d0b
```

## Before any implementation

Accept/record the region recommendation; verify actual request/export expectations and complete recovery-set size; choose and price isolated backup storage, monthly scheduling and failure delivery; account for overlap and rollback retention; verify incremental billing scope and alert permissions/delivery. Then obtain explicit provisioning approval and satisfy the independent recovery, credential, security and rollout gates already recorded in #11 and the preflight. This research satisfies none of those operational tests by itself.
