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

$(document).on('click', function(e) {
  if (!$(e.target).closest('.greedy-nav').length) {
    $('.hidden-links').addClass('hidden');
    $('.greedy-nav__toggle').removeClass('close');
  }
});
