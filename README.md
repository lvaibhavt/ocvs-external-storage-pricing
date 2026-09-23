# OCVS External Storage Pricing

Which **block (iSCSI) datastore** options exist for VMware on each hyperscaler, what they cost at list price, and what performance you get. **GCVE has no block datastore**, so it is compared on what it does offer: **storage-only nodes** (extra vSAN capacity, priced per node on-demand or with 1-/3-year commitments), or NFS from **Filestore** (the default) or **Google Cloud NetApp Volumes**, clearly flagged in the tool.

For storage-only nodes the tool shows how many nodes your usable capacity needs, and the raw and usable TB they provide under RAID-1 (50% usable) or RAID-5 (75%). Check: 3 x ve2-small-so, 3-year, Frankfurt = 3 x $5.180792 x 730 h = **$11,345.93/month**, matching the Google Cloud calculator.

**Live tool:** https://lvaibhavt.github.io/ocvs-external-storage-pricing/

Pick **Block (iSCSI/VMFS)** or **File (NFS)**, a datastore size in whole TiB, and a service and performance level per platform. The table compares them side by side, in the same format as the [node pricing tool](https://github.com/lvaibhavt/vmware-cloud-pricing-compare):

- **Configuration:** region, service, performance level, ownership
- **Protocol & media:** protocol, datastore type, media, size limits
- **Performance:** the published rate, the maximum per volume, and the expected IOPS and throughput for your datastore
- **Monthly price:** rate, per TiB, total per month, and the monthly saving against OCVS

**One datastore = one volume**, grown in whole TiB, which is how OCVS datastores are normally built. A 20 TiB OCI Block Volume at Balanced therefore shows **25,000 IOPS, 480 MB/s and $870/month**, the same as the OCI cost estimator. Only a datastore larger than one volume can be (32 TiB for OCI) uses more than one.

For more on OCI storage performance with OCVS, see Oracle's articles:
[Performance of OCI Block Volume with OCVS standard shapes](https://blogs.oracle.com/cloud-infrastructure/performance-oci-block-volume-ocvs-standard-shapes) and
[How OCI set new storage performance standards](https://blogs.oracle.com/cloud-infrastructure/how-oci-set-new-storage-performance-standards).

## What's covered

| Platform | Block | File |
|---|---|---|
| **OCVS** | OCI Block Volume (iSCSI, NVMe SSD, 4 performance levels) | OCI File Storage (NFSv3) |
| **AVS** | Azure Elastic SAN · Pure Storage Cloud Dedicated* · Everpure Cloud Azure Native* | Azure NetApp Files (Standard/Premium/Ultra/Flexible) |
| **GCVE** | **none** — Google supports no block datastore | Google Cloud NetApp Volumes · Filestore (Zonal/Regional) |
| **Amazon EVS** | FSx for NetApp ONTAP (iSCSI/NVMe) | FSx for NetApp ONTAP (NFSv3/4.1) |

\* Partner products with no public price. They're listed with **price on request** and links for getting a quote.

## Regions

Each platform has a region dropdown listing **only the regions where that VMware service runs**, and a storage option appears only where it is supported as a datastore for that service. Frankfurt is the default everywhere.

| Platform | VMware regions | Block option | File option |
|---|---|---|---|
| **OCVS** | 44 | OCI Block Volume — **all 44** | OCI File Storage — **all 44** |
| **AVS** | 43 | Elastic SAN — 36 of 43 | Azure NetApp Files — 35 of 43 (Microsoft's supported list) |
| **GCVE** | 21 | none | Filestore — 19 of 21 · NetApp Volumes — 11 of 21 |
| **Amazon EVS** | 26 | FSx for ONTAP — **all 26** | FSx for ONTAP — **all 26** |

Gaps (VMware service available, storage option not):
- **AVS, no Elastic SAN:** Belgium Central, Chile Central, Indonesia Central, Israel Central, Malaysia West, New Zealand North, Qatar Central
- **AVS, no Azure NetApp Files datastores:** Belgium Central, Chile Central, Indonesia Central, Israel Central, New Zealand North, Poland Central, South India, West Central US
- **GCVE, no Filestore:** Melbourne, Toronto
- **GCVE, no NetApp Volumes (Standard/Premium/Extreme):** Dallas, Dammam, Doha, Melbourne, Mexico, Milan, Osaka, Paris, Santiago, Sao Paulo
- Pure Storage options for AVS don't publish regional availability; confirm with Pure.

Region data lives in [`data/regions.js`](data/regions.js).

## Assumptions

- **Region:** chosen per platform (default Frankfurt). List prices, no discounts or commitments, collected 21-22 Sep 2026.
- **Units:** 1 TiB = **1,024** capacity units, matching each provider's own calculator. OCI and AWS label the unit "GB", Azure and Google "GiB". Check: 1,024 GB OCI Block Volume at Balanced = 1,024 x $0.0425 = **$43.52/month**, the same as the OCI cost estimator.
- **Capacity billed is provisioned capacity**, not post-deduplication.
- **Hours per month:** default **730**. Azure NetApp Files, Google Cloud NetApp Volumes and Filestore are billed per unit-hour, so their monthly cost is rate x hours; set 744 for a 31-day month. OCI, Elastic SAN and FSx quote flat monthly rates, so hours don't affect them.
- **Not in the monthly figure:** FSx throughput capacity and provisioned IOPS, ANF Flexible throughput, Filestore custom performance, OCI HPMT performance units. Each is noted on the card.
- Storage only: no VMware nodes, networking, egress, backup, support or taxes. For node pricing see [vmware-cloud-pricing-compare](https://github.com/lvaibhavt/vmware-cloud-pricing-compare).

## Updating prices

All prices, performance figures and links live in [`data/storage.js`](data/storage.js). Edit the numbers and update `asOf`.

Sources: OCI price list API · Azure retail prices API · Google Cloud pricing pages · AWS Price List API, plus each provider's VMware datastore documentation (linked in the tool).

## Running locally

```bash
python3 -m http.server 8000
```

## Disclaimer

Indicative figures from public list prices, for comparison only. Not a quote. Confirm with each provider before sharing with a customer.
