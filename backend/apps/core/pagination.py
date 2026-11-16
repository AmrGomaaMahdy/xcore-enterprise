from rest_framework.pagination import PageNumberPagination


class OptionalPageNumberPagination(PageNumberPagination):
    """Paginates only when the client asks for it (``?page=``); the library is small enough to list in full."""

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500

    def paginate_queryset(self, queryset, request, view=None):
        if self.page_query_param not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view)
