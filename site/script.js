const screens = {
  analytics: {
    src: "assets/analytics.png",
    alt: "Analytics dashboard screen in Stitch",
    caption:
      "Analytics gives producers a fast read on revenue, downloads, approvals, and project momentum.",
  },
  asset: {
    src: "assets/asset-detail.png",
    alt: "Asset detail purchase screen in Stitch",
    caption:
      "Asset detail pages make licensing, package metadata, creator proof, and checkout context easy to inspect.",
  },
  activity: {
    src: "assets/activity-log.png",
    alt: "Studio activity log screen in Stitch",
    caption:
      "The activity log keeps studio decisions visible across uploads, permissions, invoices, reviews, and delivery.",
  },
};

const buttons = document.querySelectorAll("[data-screen]");
const image = document.querySelector("#gallery-image");
const caption = document.querySelector("#gallery-caption");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = screens[button.dataset.screen];

    buttons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });

    image.src = selected.src;
    image.alt = selected.alt;
    caption.textContent = selected.caption;
  });
});
