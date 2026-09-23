// External (supplemental) datastore options for VMware on each hyperscaler.
//
// Prices are USD list prices for the Frankfurt region, collected 21 Sep 2026:
//   OCVS  Germany Central (eu-frankfurt-1)      AVS   Germany West Central
//   GCVE  Frankfurt (europe-west3)              EVS   EU Frankfurt (eu-central-1)
//
// Capacity convention: 1 TiB = 1,024 billed units, matching every provider's own
// calculator (1,024 GB OCI Block Volume at Balanced = 1,024 x $0.0425 = $43.52).
// OCI and AWS label the unit "GB", Azure and Google "GiB".
//
// priceHr = per unit-hour (monthly = rate x hours, default 730 h)
// price   = flat per unit-month
//
// Performance per tier, all documented by the provider:
//   iopsPerTiB / mbpsPerTiB      scale linearly with provisioned capacity
//   writeIopsPerTiB / writeMbps  where read and write are quoted separately
//   capIops / capMbps            ceiling; capScope says what the ceiling applies to
//   fixedMbps                    performance that does NOT scale with capacity

window.STORAGE = {
  asOf: "21 Sep 2026",
  defaultHours: 730,
  unitsPerTiB: 1024,
  region: "Frankfurt",

  platforms: {
    ocvs: { name: "OCVS", longName: "Oracle Cloud VMware Solution", regionName: "Germany Central (Frankfurt)", accent: "#c74634", baseline: true },
    gcve: { name: "GCVE", longName: "Google Cloud VMware Engine", regionName: "Frankfurt (europe-west3)", accent: "#1a73e8" },
    avs: { name: "AVS", longName: "Azure VMware Solution", regionName: "Germany West Central", accent: "#0078d4" },
    evs: { name: "Amazon EVS", longName: "Amazon Elastic VMware Service", regionName: "EU (Frankfurt) eu-central-1", accent: "#ff9900" }
  },
  order: ["ocvs", "gcve", "avs", "evs"],

  gaps: {
    block: { gcve: "Google supports no block (iSCSI/VMFS) datastore for VMware Engine. Its options are extra vSAN capacity via storage-only nodes, or NFSv3 datastores from Filestore or Google Cloud NetApp Volumes." }
  },

  options: [
    // ---------------- BLOCK ----------------
    {
      id: "oci-block", platform: "ocvs", kind: "block", name: "OCI Block Volume",
      protocol: "iSCSI", datastore: "VMFS", media: "NVMe SSD", ownership: "Oracle first-party", unit: "GB",
      scaling: "Scales per volume", capScope: "per volume", unitLabel: "volume",
      unitMaxTiB: 32, maxUnits: 32,
      minSize: "50 GB", maxSize: "32 TB per volume",
      tiers: [
        { desc: "Cheapest level. Suited to backups, archives and large sequential reads, not to running VMs.", id: "0", label: "Lower Cost (0 VPU)", price: 0.0255, iopsPerGB: 2, kbpsPerGB: 240, iopsPerTiB: 2048, mbpsPerTiB: 240, capIops: 3000, capMbps: 480 },
        { desc: "The default. Good for most VMware workloads — general-purpose VMs, app and web servers.", id: "10", label: "Balanced (10 VPU)", price: 0.0425, iopsPerGB: 60, kbpsPerGB: 480, iopsPerTiB: 61440, mbpsPerTiB: 480, capIops: 25000, capMbps: 480, default: true },
        { desc: "For I/O-heavy workloads such as databases, doubling the per-volume maximum of Balanced.", id: "20", label: "Higher Performance (20 VPU)", price: 0.0595, iopsPerGB: 75, kbpsPerGB: 600, iopsPerTiB: 76800, mbpsPerTiB: 600, capIops: 50000, capMbps: 680 },
        { desc: "For the most demanding, latency-sensitive workloads. OCI allows up to 120 VPU for even more.", id: "30", label: "Ultra High (30 VPU)", price: 0.0765, iopsPerGB: 90, kbpsPerGB: 720, iopsPerTiB: 92160, mbpsPerTiB: 720, capIops: 75000, capMbps: 880 }
      ],
      notes: [
        "Balanced: 60 IOPS and 480 KB/s per GB, up to 25,000 IOPS and 480 MB/s per volume — the same figures as the OCI cost estimator.",
        "Higher levels raise the maximum per volume: 50,000 IOPS at Higher Performance, 75,000 at Ultra High (30 VPU).",
        "The performance level can be changed online, with no downtime."
      ],
      links: [["OCI price list", "https://www.oracle.com/cloud/price-list/#block-volume"],
              ["Performance levels", "https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/blockvolumeperformance.htm"],
              ["OCVS datastore management", "https://docs.oracle.com/en-us/iaas/Content/VMware/Tasks/datastores.htm"]]
    },
    {
      id: "elastic-san", platform: "avs", kind: "block", name: "Azure Elastic SAN",
      protocol: "iSCSI", datastore: "VMFS", media: "SSD", ownership: "Azure first-party", unit: "GiB",
      scaling: "Scales per SAN, from base capacity only", capScope: "per volume", unitLabel: "volume",
      unitMaxTiB: 64, serviceMaxIops: 2000000, serviceMaxMbps: 80000, serviceMaxBaseTiB: 400,
      minSize: "16 TiB base capacity (AVS requirement)", maxSize: "64 TiB per volume",
      tiers: [
        { desc: "Base capacity = storage that also buys performance (5,000 IOPS and 200 MB/s per TiB). LRS keeps 3 copies inside one datacenter.", id: "lrs", label: "Premium LRS — base capacity", price: 0.095, iopsPerTiB: 5000, mbpsPerTiB: 200, capIops: 80000, capMbps: 1280, default: true },
        { desc: "Additional capacity = storage only, no extra performance, 25% cheaper. Used to add space once base capacity gives enough IOPS. LRS: 3 copies in one datacenter.", id: "lrs-add", label: "Premium LRS — additional capacity", price: 0.07125, iopsPerTiB: 0, mbpsPerTiB: 0, capIops: 0, capMbps: 0 },
        { desc: "Same as base capacity, but ZRS keeps 3 copies across 3 availability zones, so it survives a zone outage. Costs about 64% more than LRS.", id: "zrs", label: "Premium ZRS — base capacity", price: 0.156, iopsPerTiB: 5000, mbpsPerTiB: 200, capIops: 80000, capMbps: 1280 },
        { desc: "ZRS storage-only capacity: 3 copies across 3 zones, no extra performance, cheaper than ZRS base.", id: "zrs-add", label: "Premium ZRS — additional capacity", price: 0.117, iopsPerTiB: 0, mbpsPerTiB: 0, capIops: 0, capMbps: 0 }
      ],
      notes: [
        "Only base capacity adds performance: 5,000 IOPS and 200 MB/s per TiB. Additional capacity adds none and costs 25% less.",
        "SAN performance is shared across all volumes; one volume tops out at 80,000 IOPS / 1,280 MB/s.",
        "For AVS, Microsoft requires an Elastic SAN with at least 16 TiB of base capacity, in the same region and availability zone as the private cloud."
      ],
      links: [["AVS + Elastic SAN", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-azure-elastic-san"],
              ["Scale targets", "https://learn.microsoft.com/en-us/azure/storage/elastic-san/elastic-san-scale-targets"],
              ["Azure pricing calculator", "https://azure.microsoft.com/en-us/pricing/calculator/"]]
    },
    {
      id: "pure-dedicated", platform: "avs", kind: "block", name: "Pure Storage Cloud Dedicated",
      alias: "formerly Pure Cloud Block Store", protocol: "iSCSI", datastore: "VMFS / vVols",
      media: "SSD (Purity on Azure VMs + disks)", ownership: "Partner — Pure Storage", unit: "GiB",
      partner: true, priceOnRequest: true, scaling: "Depends on the deployed model", capScope: "per array",
      minSize: "Per model", maxSize: "Up to 308 TiB per array",
      notes: [
        "Partner product: Pure handles onboarding and support, and it runs in your own Azure subscription.",
        "Cost = Pure licence (direct or an Azure Marketplace private offer) + the Azure VMs and disks it runs on.",
        "Pure normally quotes effective TiB after data reduction, unlike first-party services that bill provisioned capacity.",
        "Regional availability is confirmed by Pure Storage; it is not published per region."
      ],
      links: [["Configure Pure Cloud Block Store (AVS)", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-pure-cloud-block-store"],
              ["Get a quote from Pure Storage", "https://www.purestorage.com/company/contact-us.html"]]
    },
    {
      id: "everpure", platform: "avs", kind: "block", name: "Everpure Cloud Azure Native",
      alias: "formerly Azure Native Pure Storage Cloud", protocol: "iSCSI", datastore: "vVols",
      media: "SSD (managed service)", ownership: "Partner — Pure Storage, Azure-native", unit: "GiB",
      partner: true, priceOnRequest: true, scaling: "Configurable capacity and performance", capScope: "per storage pool",
      minSize: "Per plan", maxSize: "Per plan",
      notes: [
        "Sold through the Azure Marketplace, so it is not in the Azure pricing calculator.",
        "Azure portal → Marketplace → search \"Everpure Cloud\". Some plans show a price, others are private offers.",
        "Uses VAAI offload with AVS.",
        "Regional availability depends on the Marketplace plan; confirm with Pure Storage."
      ],
      links: [["Azure Native Pure Storage Cloud (AVS)", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-azure-native-pure-storage-cloud"],
              ["What is Everpure Cloud Azure Native?", "https://learn.microsoft.com/en-us/azure/partner-solutions/pure-storage/overview"]]
    },
    {
      id: "fsx-block", platform: "evs", kind: "block", name: "Amazon FSx for NetApp ONTAP",
      protocol: "iSCSI / NVMe", datastore: "VMFS", media: "SSD (+ optional cold tier)",
      ownership: "AWS first-party — NetApp ONTAP", unit: "GB",
      scaling: "Scales per file system, capped by throughput capacity", capScope: "per file system", unitLabel: "file system",
      unitMaxTiB: 192,
      minSize: "1,024 GiB SSD", maxSize: "192 TiB SSD per HA pair",
      tiers: [
        { desc: "File system and its standby both in one availability zone. The lower-cost choice.", id: "single", label: "Single-AZ SSD", price: 0.149, iopsPerTiB: 3072, mbpsPerTiB: 768, capIops: 200000, capMbps: 6144, default: true },
        { desc: "Standby copy in a second availability zone, so it survives a zone outage. Twice the Single-AZ price.", id: "multi", label: "Multi-AZ SSD", price: 0.298, iopsPerTiB: 3072, mbpsPerTiB: 768, capIops: 200000, capMbps: 6144 },
        { desc: "Low-cost cold tier. ONTAP moves rarely used data here automatically. Tens of milliseconds of latency, so not for active VMs.", id: "pool", label: "Capacity pool (cold tier)", price: 0.0233, iopsPerTiB: 0, mbpsPerTiB: 0, pool: true }
      ],
      notes: [
        "SSD defaults to 3,072 IOPS and 768 MB/s per TiB, both capped by the throughput capacity bought for the file system.",
        "Throughput capacity is charged separately ($0.822 per MB/s per month Single-AZ, $1.369 Multi-AZ) and is NOT in the price shown.",
        "Extra SSD IOPS cost $0.0204 (Single-AZ) or $0.0408 (Multi-AZ) per IOPS-month.",
        "Capacity pool is cold, tiered storage: tens of milliseconds of latency instead of sub-millisecond."
      ],
      links: [["FSx for ONTAP with EVS", "https://docs.aws.amazon.com/evs/latest/userguide/fsx-ontap.html"],
              ["iSCSI datastore setup", "https://docs.aws.amazon.com/evs/latest/userguide/config-fsx-iscsi-datastore.html"],
              ["Performance", "https://docs.aws.amazon.com/fsx/latest/ONTAPGuide/performance.html"],
              ["AWS pricing calculator", "https://calculator.aws/#/createCalculator/FSxONTAP"]]
    },

    // ---------------- GCVE STORAGE-ONLY NODES (vSAN) ----------------
    {
      id: "gcve-so", platform: "gcve", kind: "vsan", name: "Storage-only nodes (vSAN)",
      protocol: "vSAN (local to the cluster)", datastore: "vSAN", media: "NVMe SSD (local disks)",
      ownership: "Google first-party", unit: "node", nodeBased: true,
      scaling: "Adds vSAN capacity to the cluster, no cores or memory", capScope: "per cluster",
      minSize: "1 node (cluster needs 3 HCI nodes, or 2 in a workload cluster)", maxSize: "Up to 50% of the nodes in a cluster",
      // rawTB = raw vSAN capacity per node (decimal TB, excluding cache). Hourly prices by term come from regions.js.
      tiers: [
        { id: "ve2-small-so", label: "ve2-small-so — 12.8 TB raw", rawTB: 12.8, desc: "Smallest storage-only node: 12.8 TB raw. Pairs with ve2-small HCI nodes.", default: true },
        { id: "ve2-standard-so", label: "ve2-standard-so — 25.5 TB raw", rawTB: 25.5, desc: "25.5 TB raw per node. Pairs with ve2-standard HCI nodes." },
        { id: "ve2-large-so", label: "ve2-large-so — 38.4 TB raw", rawTB: 38.4, desc: "38.4 TB raw per node. Pairs with ve2-large HCI nodes." },
        { id: "ve2-mega-so", label: "ve2-mega-so — 51.2 TB raw", rawTB: 51.2, desc: "Largest storage-only node: 51.2 TB raw. Pairs with ve2-mega HCI nodes." }
      ],
      terms: [
        { id: "3yr", label: "3-year commitment (monthly payments)", idx: 2, default: true },
        { id: "1yr", label: "1-year commitment (monthly payments)", idx: 1 },
        { id: "od", label: "On-demand", idx: 0 }
      ],
      protections: [
        { id: "r1", label: "RAID-1, FTT=1 (mirroring) — 50% usable", factor: 0.5, default: true },
        { id: "r5", label: "RAID-5, FTT=1 (erasure coding) — 75% usable", factor: 0.75 }
      ],
      notes: [
        "Storage-only nodes have no customer-usable cores or memory; they only add vSAN capacity to an existing cluster.",
        "A cluster needs at least 3 HCI nodes (management cluster) or 2 (workload cluster) before storage-only nodes can be added, and at most 50% of the cluster can be storage-only.",
        "The node must match the cluster's HCI family and size class (e.g. ve2-small-so with ve2-small-* nodes).",
        "Usable capacity depends on the vSAN storage policy: RAID-1 (FTT=1) keeps two copies (50% usable); RAID-5 (FTT=1) is about 75% usable. VMware also recommends leaving 25–30% free (slack space), which is not deducted here.",
        "The price covers the storage-only nodes only — not the HCI nodes they are added to."
      ],
      links: [["Storage-only nodes", "https://docs.cloud.google.com/vmware-engine/docs/concepts-storage-only-nodes"],
              ["Use storage-only nodes", "https://docs.cloud.google.com/vmware-engine/docs/networking/howto-use-storage-only-nodes"],
              ["Node types", "https://docs.cloud.google.com/vmware-engine/docs/concepts-node-types"],
              ["VMware Engine pricing", "https://cloud.google.com/vmware-engine/pricing"]]
    },

    // ---------------- FILE ----------------
    {
      id: "oci-fss", platform: "ocvs", kind: "file", name: "OCI File Storage (FSS)",
      protocol: "NFSv3", datastore: "NFS", media: "SSD-backed, 5-way replicated", ownership: "Oracle first-party", unit: "GB",
      scaling: "Fixed per mount target — does not scale with capacity", capScope: "per mount target",
      minSize: "No minimum", maxSize: "8 EB per file system",
      tiers: [
        { desc: "The normal way to mount OCI File Storage. Throughput comes from the mount target, not from how much you store.", id: "std", label: "Standard mount target", price: 0.30, fixedMbps: 1250, default: true },
        { desc: "High Performance Mount Target: 20 Gbps for the file system. Extra monthly charge, 30-day commitment.", id: "hpmt20", label: "HPMT-20 (20 Gbps)", price: 0.30, fixedMbps: 2500, extra: true },
        { desc: "High Performance Mount Target: 40 Gbps. Extra monthly charge, 30-day commitment.", id: "hpmt40", label: "HPMT-40 (40 Gbps)", price: 0.30, fixedMbps: 5000, extra: true },
        { desc: "High Performance Mount Target: 80 Gbps. Extra monthly charge, 30-day commitment.", id: "hpmt80", label: "HPMT-80 (80 Gbps)", price: 0.30, fixedMbps: 10000, extra: true }
      ],
      notes: [
        "Performance comes from the mount target, not from provisioned capacity: a 100 GiB share and a 100 TiB share get the same throughput.",
        "High Performance Mount Targets (20/40/80 Gbps) are billed separately per performance unit with a 30-day commitment; that charge is NOT in the price shown.",
        "Scale out with more mount targets — Oracle has demonstrated 1.6M IOPS across four.",
        "VMware-certified as secondary storage for OCVS (March 2022).",
        "For bulk capacity on OCVS, block volume datastores are far cheaper per TiB than FSS."
      ],
      links: [["OCI File Storage is VMware certified", "https://blogs.oracle.com/cloud-infrastructure/post/oci-fss-service-is-now-vmware-certified"],
              ["OCI price list", "https://www.oracle.com/cloud/price-list/#file-storage"],
              ["Mount target performance", "https://docs.oracle.com/en-us/iaas/Content/File/Tasks/change-mt-performance.htm"]]
    },
    {
      id: "anf", platform: "avs", kind: "file", name: "Azure NetApp Files",
      protocol: "NFS", datastore: "NFS", media: "Bare-metal flash (NetApp)", ownership: "Azure first-party", unit: "GiB",
      scaling: "Scales per volume, with the assigned quota", capScope: "per volume", unitLabel: "volume",
      unitMaxTiB: 100,
      minSize: "1 TiB capacity pool", maxSize: "1 PiB pool · 100 TiB large volume",
      tiers: [
        { desc: "16 MiB/s per TiB. Lowest cost, for capacity-heavy, low-activity data.", id: "standard", label: "Standard", priceHr: 0.000202, mbpsPerTiB: 16, mib: true },
        { desc: "64 MiB/s per TiB. The usual choice for general VMware datastores.", id: "premium", label: "Premium", priceHr: 0.000403, mbpsPerTiB: 64, mib: true, default: true },
        { desc: "128 MiB/s per TiB. For throughput-hungry workloads.", id: "ultra", label: "Ultra", priceHr: 0.000538, mbpsPerTiB: 128, mib: true },
        { desc: "Pay for capacity and throughput separately — useful for big but quiet datastores. Throughput (min 128 MiB/s) is extra.", id: "flexible", label: "Flexible (capacity only)", priceHr: 0.000196, mbpsPerTiB: 0, mib: true, extra: true }
      ],
      notes: [
        "Throughput follows the service level and the volume quota: 16 / 64 / 128 MiB/s per TiB for Standard / Premium / Ultra.",
        "Microsoft publishes throughput, not IOPS, for the service levels.",
        "Flexible decouples capacity from throughput: minimum 128 MiB/s, then $2.93 per MiB/s per month, not in the price shown."
      ],
      links: [["Attach ANF datastores to AVS", "https://learn.microsoft.com/en-us/azure/azure-vmware/attach-azure-netapp-files-to-azure-vmware-solution-hosts"],
              ["Service levels", "https://learn.microsoft.com/en-us/azure/azure-netapp-files/azure-netapp-files-service-levels"],
              ["ANF pricing", "https://azure.microsoft.com/en-us/pricing/details/netapp/"]]
    },
    {
      id: "gcnv", platform: "gcve", kind: "file", name: "Google Cloud NetApp Volumes",
      protocol: "NFSv3", datastore: "NFS", media: "Not published by Google", ownership: "Google first-party — NetApp", unit: "GiB",
      scaling: "Scales per volume, with provisioned capacity", capScope: "per storage pool", unitLabel: "volume",
      unitMaxTiB: 100,
      minSize: "1 TiB storage pool", maxSize: "Varies by service level",
      tiers: [
        { desc: "16 KiB/s per GiB (16 MiB/s per TiB). Lowest cost.", id: "standard", label: "Standard", priceHr: 0.000315068, mbpsPerTiB: 16, mib: true },
        { desc: "64 KiB/s per GiB (64 MiB/s per TiB). The usual choice for VMware datastores.", id: "premium", label: "Premium", priceHr: 0.000463425, mbpsPerTiB: 64, mib: true, default: true },
        { desc: "128 KiB/s per GiB (128 MiB/s per TiB). For the most throughput-hungry workloads.", id: "extreme", label: "Extreme", priceHr: 0.00061863, mbpsPerTiB: 128, mib: true }
      ],
      notes: [
        "Throughput scales with capacity: 16 / 64 / 128 KiB/s per GiB for Standard / Premium / Extreme.",
        "Google publishes throughput, not IOPS, and does not publish the underlying media.",
        "NFSv3 only — NFSv4.1 is not supported as a VMware Engine datastore.",
        "1-year and 3-year committed use discounts exist; the price shown is list."
      ],
      links: [["NetApp Volumes as a GCVE datastore", "https://docs.cloud.google.com/vmware-engine/docs/vmware-ecosystem/howto-cloud-volumes-datastores-vmware-engine"],
              ["NetApp Volumes pricing", "https://cloud.google.com/netapp/volumes/pricing"],
              ["Service levels", "https://docs.cloud.google.com/netapp/volumes/docs/discover/service-levels"]]
    },
    {
      id: "filestore", platform: "gcve", kind: "file", name: "Filestore",
      protocol: "NFSv3", datastore: "NFS", media: "SSD", ownership: "Google first-party", unit: "GiB",
      scaling: "Scales per instance, with capacity", capScope: "per instance", unitLabel: "instance",
      unitMaxTiB: 100,
      minSize: "10 TiB to be VMware-certified", maxSize: "100 TiB per instance",
      tiers: [
        { desc: "Data kept in one zone. Lower cost; unavailable if that zone fails.", id: "zonal", label: "Zonal", priceHr: 0.000410959, iopsPerTiB: 9200, mbpsPerTiB: 260, mib: true, writeIopsPerTiB: 2600, writeMbpsPerTiB: 88, default: true },
        { desc: "Data replicated across zones in the region, so it survives a zone outage. About 80% more than Zonal.", id: "regional", label: "Regional", priceHr: 0.000739726, iopsPerTiB: 9200, mbpsPerTiB: 260, mib: true, writeIopsPerTiB: 2600, writeMbpsPerTiB: 88 }
      ],
      notes: [
        "Performance scales with capacity: at 10 TiB, 92,000 read IOPS / 26,000 write IOPS and 2,600 MiB/s read / 880 MiB/s write.",
        "Only Zonal and Regional tiers of 10 TiB or more are VMware-certified; Basic SSD and Basic HDD are not supported.",
        "Custom performance (provisioned IOPS) is billed separately and is not in the price shown.",
        "NFSv3 only."
      ],
      links: [["Filestore volumes as GCVE datastores", "https://docs.cloud.google.com/vmware-engine/docs/vmware-ecosystem/howto-filestore-storage-for-vmware-engine-datastores"],
              ["Performance", "https://docs.cloud.google.com/filestore/docs/performance"],
              ["Filestore pricing", "https://cloud.google.com/filestore/pricing"]]
    },
    {
      id: "fsx-file", platform: "evs", kind: "file", name: "Amazon FSx for NetApp ONTAP",
      protocol: "NFSv3 / NFSv4.1", datastore: "NFS", media: "SSD (+ optional cold tier)",
      ownership: "AWS first-party — NetApp ONTAP", unit: "GB",
      scaling: "Scales per file system, capped by throughput capacity", capScope: "per file system", unitLabel: "file system",
      unitMaxTiB: 192,
      minSize: "1,024 GiB SSD", maxSize: "192 TiB SSD per HA pair",
      tiers: [
        { desc: "File system and its standby both in one availability zone. The lower-cost choice.", id: "single", label: "Single-AZ SSD", price: 0.149, iopsPerTiB: 3072, mbpsPerTiB: 768, capIops: 200000, capMbps: 6144, default: true },
        { desc: "Standby copy in a second availability zone, so it survives a zone outage. Twice the Single-AZ price.", id: "multi", label: "Multi-AZ SSD", price: 0.298, iopsPerTiB: 3072, mbpsPerTiB: 768, capIops: 200000, capMbps: 6144 },
        { desc: "Low-cost cold tier. ONTAP moves rarely used data here automatically. Tens of milliseconds of latency, so not for active VMs.", id: "pool", label: "Capacity pool (cold tier)", price: 0.0233, iopsPerTiB: 0, mbpsPerTiB: 0, pool: true }
      ],
      notes: [
        "SSD defaults to 3,072 IOPS and 768 MB/s per TiB, both capped by the file system's throughput capacity.",
        "Throughput capacity is charged separately ($0.822 per MB/s per month Single-AZ) and is NOT in the price shown.",
        "The only external datastore AWS documents as validated for EVS, and the only option here supporting NFSv4.1.",
        "Capacity pool is cold, tiered storage with tens of milliseconds of latency."
      ],
      links: [["FSx for ONTAP with EVS", "https://docs.aws.amazon.com/evs/latest/userguide/fsx-ontap.html"],
              ["NFS datastore setup", "https://docs.aws.amazon.com/evs/latest/userguide/config-fsx-nfs-datastore.html"],
              ["Performance", "https://docs.aws.amazon.com/fsx/latest/ONTAPGuide/performance.html"],
              ["FSx pricing", "https://aws.amazon.com/fsx/netapp-ontap/pricing/"]]
    }
  ]
};
