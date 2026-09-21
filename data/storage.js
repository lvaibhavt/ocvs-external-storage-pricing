// External (supplemental) datastore options for VMware on each hyperscaler.
//
// Prices are USD list prices for the Frankfurt region, collected 21 Sep 2026:
//   OCVS  Germany Central (eu-frankfurt-1)      AVS   Germany West Central
//   GCVE  Frankfurt (europe-west3)              EVS   EU Frankfurt (eu-central-1)
//
// unit: "GB"  = billed per decimal GB-month  (1 TiB = 1099.51 GB)
//       "GiB" = billed per binary GiB-month  (1 TiB = 1024 GiB)
//
// perf(tib) returns the headline performance for that capacity, so shapes that
// scale with size (almost all of them) stay honest.

window.STORAGE = {
  asOf: "21 Sep 2026",
  region: "Frankfurt",
  platforms: {
    ocvs: { name: "OCVS", longName: "Oracle Cloud VMware Solution", regionName: "Germany Central (Frankfurt)", accent: "#c74634" },
    avs: { name: "AVS", longName: "Azure VMware Solution", regionName: "Germany West Central", accent: "#0078d4" },
    gcve: { name: "GCVE", longName: "Google Cloud VMware Engine", regionName: "Frankfurt (europe-west3)", accent: "#1a73e8" },
    evs: { name: "Amazon EVS", longName: "Amazon Elastic VMware Service", regionName: "EU (Frankfurt) eu-central-1", accent: "#ff9900" }
  },

  // No block datastore exists on GCVE; say so rather than showing an empty column.
  gaps: {
    block: { gcve: "Google does not support any block (iSCSI/VMFS) datastore for VMware Engine. Only NFSv3 datastores from Filestore and Google Cloud NetApp Volumes are supported." }
  },

  options: [
    // ---------------- BLOCK ----------------
    {
      id: "oci-block", platform: "ocvs", kind: "block", name: "OCI Block Volume",
      protocol: "iSCSI (VMFS)", media: "NVMe SSD", firstParty: true, unit: "GB",
      // Storage $0.0255/GB-mo + $0.0017 per VPU per GB-mo.
      tiers: [
        { id: "0", label: "Lower Cost (0 VPU)", price: 0.0255, iopsPerGB: 2, maxIops: 3000, kbpsPerGB: 240, maxMBps: 480 },
        { id: "10", label: "Balanced (10 VPU)", price: 0.0425, iopsPerGB: 60, maxIops: 25000, kbpsPerGB: 480, maxMBps: 480, default: true },
        { id: "20", label: "Higher Performance (20 VPU)", price: 0.0595, iopsPerGB: 75, maxIops: 50000, kbpsPerGB: 600, maxMBps: 680 },
        { id: "30", label: "Ultra High (30 VPU)", price: 0.0765, iopsPerGB: 90, maxIops: 75000, kbpsPerGB: 720, maxMBps: 880 }
      ],
      perf: (tib, t) => `${fmt(Math.min(t.iopsPerGB * tib * 1099.51, t.maxIops))} IOPS per volume · up to ${t.maxMBps} MB/s`,
      notes: [
        "Per-volume limits; a datastore can use several volumes (SDDC pool max 32 volumes, 32 TB each).",
        "Performance level is set per volume and can be changed online."
      ],
      links: [["OCI Block Volume pricing", "https://www.oracle.com/cloud/price-list/#block-volume"],
              ["Performance levels", "https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/blockvolumeperformance.htm"],
              ["OCVS datastore management", "https://docs.oracle.com/en-us/iaas/Content/VMware/Tasks/datastores.htm"]]
    },
    {
      id: "elastic-san", platform: "avs", kind: "block", name: "Azure Elastic SAN",
      protocol: "iSCSI (VMFS)", media: "SSD", firstParty: true, unit: "GiB",
      tiers: [
        { id: "lrs", label: "Premium LRS (base capacity)", price: 0.095, iopsPerTiB: 5000, mbpsPerTiB: 200, default: true },
        { id: "lrs-add", label: "Premium LRS (additional capacity)", price: 0.07125, iopsPerTiB: 0, mbpsPerTiB: 0 },
        { id: "zrs", label: "Premium ZRS (base capacity)", price: 0.156, iopsPerTiB: 5000, mbpsPerTiB: 200 }
      ],
      perf: (tib, t) => t.iopsPerTiB
        ? `${fmt(t.iopsPerTiB * tib)} IOPS · ${fmt(t.mbpsPerTiB * tib)} MB/s (SAN-wide)`
        : "No added IOPS or throughput (capacity only)",
      notes: [
        "Base capacity adds 5,000 IOPS and 200 MB/s per TiB; additional capacity adds none, so most designs mix the two.",
        "Per volume: up to 80,000 IOPS and 1,280 MB/s, drawn from the SAN totals.",
        "Minimum SAN size 1 TiB."
      ],
      links: [["AVS + Elastic SAN", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-azure-elastic-san"],
              ["Scale targets", "https://learn.microsoft.com/en-us/azure/storage/elastic-san/elastic-san-scale-targets"],
              ["Azure pricing calculator", "https://azure.microsoft.com/en-us/pricing/calculator/"]]
    },
    {
      id: "pure-dedicated", platform: "avs", kind: "block", name: "Pure Storage Cloud Dedicated",
      alias: "formerly Pure Cloud Block Store", protocol: "iSCSI (VMFS / vVols)", media: "SSD (Purity on Azure VMs + managed disks)",
      partner: true, unit: "GiB", priceOnRequest: true,
      perf: () => "Depends on the deployed model (V10MUR1 / V20MUR1 / V20MP2R2)",
      notes: [
        "Partner product: Pure Storage handles onboarding and support; you deploy it into your own Azure subscription.",
        "Cost = Pure licence (from Pure Storage or an Azure Marketplace private offer) + the Azure VMs and managed disks it runs on.",
        "Pure usually quotes effective TiB after data reduction, while the first-party services bill provisioned capacity."
      ],
      links: [["Configure Pure Cloud Block Store (AVS)", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-pure-cloud-block-store"],
              ["Contact Pure Storage for pricing", "https://www.purestorage.com/company/contact-us.html"]]
    },
    {
      id: "everpure", platform: "avs", kind: "block", name: "Everpure Cloud Azure Native",
      alias: "formerly Azure Native Pure Storage Cloud", protocol: "iSCSI (vVols)", media: "SSD (managed service)",
      partner: true, unit: "GiB", priceOnRequest: true,
      perf: () => "Configurable capacity and performance (managed service)",
      notes: [
        "Azure-native experience, but sold through the Azure Marketplace, so it is not in the Azure pricing calculator.",
        "Subscribe in the Azure portal: Marketplace → search \"Everpure Cloud\". Some plans show a price, others are private offers.",
        "Uses VAAI offload with AVS."
      ],
      links: [["Azure Native Pure Storage Cloud (AVS)", "https://learn.microsoft.com/en-us/azure/azure-vmware/configure-azure-native-pure-storage-cloud"],
              ["What is Everpure Cloud Azure Native?", "https://learn.microsoft.com/en-us/azure/partner-solutions/pure-storage/overview"]]
    },
    {
      id: "fsx-block", platform: "evs", kind: "block", name: "Amazon FSx for NetApp ONTAP",
      protocol: "iSCSI (VMFS) / NVMe", media: "SSD (plus optional capacity-pool tier)", firstParty: true, unit: "GB",
      tiers: [
        { id: "single", label: "Single-AZ SSD", price: 0.149, mbpsPrice: 0.822, default: true },
        { id: "multi", label: "Multi-AZ SSD", price: 0.298, mbpsPrice: 1.369 },
        { id: "pool", label: "Capacity pool (Single-AZ, tiered)", price: 0.0233, mbpsPrice: 0.822, pool: true }
      ],
      perf: (tib, t) => t.pool
        ? "Cold tier: throughput from the file system, higher latency"
        : `${fmt(3 * tib * 1099.51)} IOPS included (3 IOPS/GB) · throughput as provisioned`,
      notes: [
        "Throughput capacity is billed separately, per MB/s per month, and is set on the file system.",
        "SSD IOPS above 3 per GB can be provisioned at $0.0408 per IOPS-month (Multi-AZ) / $0.0204 (Single-AZ).",
        "The capacity pool tier is for cold data; ONTAP tiers it automatically."
      ],
      links: [["FSx for ONTAP with EVS", "https://docs.aws.amazon.com/evs/latest/userguide/fsx-ontap.html"],
              ["iSCSI datastore setup", "https://docs.aws.amazon.com/evs/latest/userguide/config-fsx-iscsi-datastore.html"],
              ["FSx pricing", "https://aws.amazon.com/fsx/netapp-ontap/pricing/"],
              ["AWS pricing calculator", "https://calculator.aws/#/createCalculator/FSxONTAP"]]
    },

    // ---------------- FILE ----------------
    {
      id: "oci-fss", platform: "ocvs", kind: "file", name: "OCI File Storage (FSS)",
      protocol: "NFSv3", media: "SSD-backed, 5-way replicated", firstParty: true, unit: "GB",
      tiers: [{ id: "std", label: "Standard mount target", price: 0.30, default: true }],
      perf: tib => "Mount target throughput; HPMT options give 20 / 40 / 80 Gbps",
      notes: [
        "VMware-certified as secondary storage for OCVS clusters (March 2022).",
        "High Performance Mount Targets (HPMT-20/40/80) are billed per performance unit and carry a 30-day commitment.",
        "Scale out with more mount targets for higher aggregate throughput.",
        "For bulk capacity on OCVS, OCI Block Volume datastores are far cheaper per TiB than FSS; FSS suits shared-file and lift-and-shift cases."
      ],
      links: [["OCI File Storage is VMware certified", "https://blogs.oracle.com/cloud-infrastructure/post/oci-fss-service-is-now-vmware-certified"],
              ["OCI price list", "https://www.oracle.com/cloud/price-list/#file-storage"],
              ["Mount target performance", "https://docs.oracle.com/en-us/iaas/Content/File/Tasks/change-mt-performance.htm"]]
    },
    {
      id: "anf", platform: "avs", kind: "file", name: "Azure NetApp Files",
      protocol: "NFS", media: "Bare-metal flash (NetApp)", firstParty: true, unit: "GiB",
      tiers: [
        { id: "standard", label: "Standard", price: 0.1475, mibpsPerTiB: 16 },
        { id: "premium", label: "Premium", price: 0.2942, mibpsPerTiB: 64, default: true },
        { id: "ultra", label: "Ultra", price: 0.3927, mibpsPerTiB: 128 },
        { id: "flexible", label: "Flexible (capacity)", price: 0.1431, mibpsPerTiB: 0, flex: true }
      ],
      perf: (tib, t) => t.flex
        ? "Throughput bought separately: min 128 MiB/s, $2.93 per MiB/s per month"
        : `${fmt(t.mibpsPerTiB * tib)} MiB/s (${t.mibpsPerTiB} MiB/s per TiB)`,
      notes: [
        "Throughput is tied to the service level and provisioned capacity, not to IOPS.",
        "Attached to AVS clusters as NFS datastores.",
        "Flexible service level decouples capacity from throughput."
      ],
      links: [["Attach ANF datastores to AVS", "https://learn.microsoft.com/en-us/azure/azure-vmware/attach-azure-netapp-files-to-azure-vmware-solution-hosts"],
              ["Service levels", "https://learn.microsoft.com/en-us/azure/azure-netapp-files/azure-netapp-files-service-levels"],
              ["ANF pricing", "https://azure.microsoft.com/en-us/pricing/details/netapp/"]]
    },
    {
      id: "gcnv", platform: "gcve", kind: "file", name: "Google Cloud NetApp Volumes",
      protocol: "NFSv3", media: "Not published by Google", firstParty: true, unit: "GiB",
      tiers: [
        { id: "standard", label: "Standard", price: 0.23, mibpsPerTiB: 16 },
        { id: "premium", label: "Premium", price: 0.338, mibpsPerTiB: 64, default: true },
        { id: "extreme", label: "Extreme", price: 0.452, mibpsPerTiB: 128 }
      ],
      perf: (tib, t) => `${fmt(t.mibpsPerTiB * tib)} MiB/s (${t.mibpsPerTiB} KiB/s per GiB)`,
      notes: [
        "Certified as an NFS datastore for VMware Engine; NFSv3 only (NFSv4.1 is not supported).",
        "1-year and 3-year committed use discounts are available (not applied here).",
        "Flex service levels allow custom capacity, throughput and IOPS."
      ],
      links: [["NetApp Volumes as a GCVE datastore", "https://docs.cloud.google.com/vmware-engine/docs/vmware-ecosystem/howto-cloud-volumes-datastores-vmware-engine"],
              ["NetApp Volumes pricing", "https://cloud.google.com/netapp/volumes/pricing"],
              ["Service levels", "https://docs.cloud.google.com/netapp/volumes/docs/discover/service-levels"]]
    },
    {
      id: "filestore", platform: "gcve", kind: "file", name: "Filestore",
      protocol: "NFSv3", media: "SSD", firstParty: true, unit: "GiB",
      tiers: [
        { id: "zonal", label: "Zonal", price: 0.30, default: true },
        { id: "regional", label: "Regional", price: 0.54 }
      ],
      perf: () => "Scales with capacity; VMware-certified from 10 TiB upwards",
      notes: [
        "Only Zonal and Regional tiers of 10 TiB or more are VMware-certified. Basic SSD and Basic HDD are not supported.",
        "Custom performance (provisioned IOPS) is billed separately.",
        "NFSv3 only."
      ],
      links: [["Filestore volumes as GCVE datastores", "https://docs.cloud.google.com/vmware-engine/docs/vmware-ecosystem/howto-filestore-storage-for-vmware-engine-datastores"],
              ["Storage for GCVE datastores", "https://docs.cloud.google.com/filestore/docs/gcve-datastores"],
              ["Filestore pricing", "https://cloud.google.com/filestore/pricing"]]
    },
    {
      id: "fsx-file", platform: "evs", kind: "file", name: "Amazon FSx for NetApp ONTAP",
      protocol: "NFSv3 / NFSv4.1", media: "SSD (plus optional capacity-pool tier)", firstParty: true, unit: "GB",
      tiers: [
        { id: "single", label: "Single-AZ SSD", price: 0.149, mbpsPrice: 0.822, default: true },
        { id: "multi", label: "Multi-AZ SSD", price: 0.298, mbpsPrice: 1.369 },
        { id: "pool", label: "Capacity pool (Single-AZ, tiered)", price: 0.0233, mbpsPrice: 0.822, pool: true }
      ],
      perf: (tib, t) => t.pool
        ? "Cold tier: throughput from the file system, higher latency"
        : `${fmt(3 * tib * 1099.51)} IOPS included (3 IOPS/GB) · throughput as provisioned`,
      notes: [
        "The only external datastore AWS documents as validated for EVS; covers both NFS and iSCSI.",
        "Throughput capacity is billed separately per MB/s per month.",
        "NFSv4.1 is supported, unlike GCVE."
      ],
      links: [["FSx for ONTAP with EVS", "https://docs.aws.amazon.com/evs/latest/userguide/fsx-ontap.html"],
              ["NFS datastore setup", "https://docs.aws.amazon.com/evs/latest/userguide/config-fsx-nfs-datastore.html"],
              ["FSx pricing", "https://aws.amazon.com/fsx/netapp-ontap/pricing/"]]
    }
  ]
};

function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
