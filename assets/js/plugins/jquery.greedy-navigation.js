/*
 * Simple burger-menu toggle
 *
 * CSS media queries handle showing/hiding inline links vs burger.
 * JS only toggles the dropdown on click.
 */

$('.greedy-nav__toggle').on('click', function() {
  $('.hidden-links').toggleClass('hidden');
  $(this).toggleClass('close');
});
