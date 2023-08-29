---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---

{% if author.orcid %}
  You can also find my articles on <u><a href="{{author.orcid}}">my ORCID profile</a>.</u>
{% endif %}

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}
