const groups = document.querySelectorAll(".step-group");

groups.forEach(group => {
  const button = group.querySelector(".step");

  button.addEventListener("click", () => {

    const isAlreadyOpen = group.classList.contains("active");

    groups.forEach(item => {
      item.classList.remove("active");

      const itemButton = item.querySelector(".step");
      itemButton.classList.remove("active");
    });

    if (!isAlreadyOpen) {
      group.classList.add("active");
      button.classList.add("active");
    }

  });
});