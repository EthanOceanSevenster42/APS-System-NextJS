from django.urls import path
from . import views
from .views.core_views import (
    settings_view, inspector_settings_view, session_status, refresh_shipments, refresh_clients,
    refresh_inspections, check_sync_status, shipment_list, edit_shipment, delete_shipment,
    delete_inspection, upload_document, user_management, system_logs, fsa_operations_board, submit_ticket, update_ticket_status, refresh_tokens,
    add_fsa_inspection, edit_fsa_inspection, delete_fsa_inspection, delete_inspection_group,
    update_bought_sample, update_group_approved, update_sample_taken, dashboard, compliance_documents, onedrive_view, compliance_linking_page,
    get_inspection_data, process_document_links, download_compliance_documents,
    process_all_compliance_documents, start_compliance_document_download,
    get_inspection_files, download_inspection_file, download_all_inspection_files, get_zip_contents,
    send_group_documents, save_manual_client_email,
    delete_client_email, start_compliance_background, stop_compliance_background,
    compliance_background_status, start_compliance_linking, pause_compliance_linking,
    reset_compliance_progress, compliance_linking_status, process_compliance_batch,
    first_50_compliance_links, fetch_and_store_first_50_compliance_docs,
    list_any_50_drive_files, fetch_store_any_50_drive_files, drive_any10_page,
    download_first_10_compliance_by_commodity,
    save_system_settings, get_system_settings, start_daily_compliance_sync, stop_daily_compliance_sync, daily_compliance_sync_status, performance_monitor, server_directory_tree, server_status,
    check_compliance_documents_batch, populate_six_month_files, pull_six_month_data_from_google_drive, get_client_all_files, get_page_clients_files, get_page_clients_file_status, update_sent_status, client_autocomplete_api, onedrive_callback, inspector_dashboard, analytics_dashboard,
    scheduled_backup_service_status, start_scheduled_backup_service, stop_scheduled_backup_service, run_manual_backup, download_backup,
    master_service_control_status, start_all_services, stop_all_services,
    onedrive_service_status, start_onedrive_service, stop_onedrive_service, test_onedrive_connection,
    reauthenticate_onedrive, get_onedrive_auth_url, onedrive_auth, export_sheet, export_to_google_sheets, update_invoice_number, send_password_reset_email,
    analytics_dashboard_api,
    inspector_dashboard_api,
    get_inspector_targets, update_inspector_targets,
    get_quarterly_targets, save_quarterly_target,
    get_inspector_salaries, save_inspector_salaries,
    forgot_password, reset_password_confirm, get_notifications, mark_notification_read,
    mark_all_notifications_read, delete_notification, training_page,
    trigger_kpi_emails,
    delete_ticket, get_ticket_details, create_ticket_admin, assign_ticket,
)
from .views.kpi_report import api_kpi_report, api_sample_discrepancies, api_sample_discrepancy_rectify, api_toggle_group_discrepancy, api_open_discrepancy_groups
from .views.late_capture_report import api_late_capture_report
from .views.weekly_report import api_weekly_report
from .views.weekly_email import (
    api_weekly_email_settings,
    api_weekly_email_recipient,
    api_weekly_email_logs,
    api_weekly_email_test,
    api_weekly_email_users,
    api_weekly_email_send_now,
    api_weekly_email_attachment,
)
from .views.client_approval import (
    api_clients_approval, api_client_approve, api_client_merge, api_clients_approval_report,
)
from .views.data_views import (
    export_shipments, get_inspection_fees, update_inspection_fees, get_inspection_fee_history,
    api_inspections, api_clients,
    api_client_add, api_client_edit, api_client_delete,
    api_dropdown_options, api_dropdown_option_delete,
    api_users,
    api_upload_document,
    api_get_inspection_files,
    api_inspection_form_data,
    api_add_inspection,
    api_system_logs,
    api_restore_deleted_inspection,
    api_log_activity,
    api_export_sheet,
    api_server_view,
    api_settings,
    api_submit_ticket,
    api_debtors,
    api_analytics,
    api_inspector_salaries,
    api_quarterly_targets,
    api_react_fees_get,
    api_react_fees_update,
    api_react_fees_history,
    api_corporate_invoice_file,
    api_corporate_group_emails,
    api_corporate_group_email_delete,
    api_send_corporate_invoice,
    api_download_backup,
    api_home_stats,
    api_support_tickets,
    api_support_update_status,
    api_support_delete_ticket,
    api_support_create_ticket,
    api_login,
    api_me,
    api_lab_analytics,
    api_admin_analytics,
    api_serve_file,
    api_delete_file,
    api_get_inspection_group,
    api_edit_inspection_group,
    api_inspector_mappings,
    api_onedrive_view,
    api_convert_docx_to_pdf,
    api_send_occurrence_email,
    api_verify_otp,
)
from .views.xero_views import (
    xero_connect, xero_callback, xero_disconnect, xero_status,
    xero_sync_invoices, xero_invoices_list, debtors_page, debtors_export_excel,
)

urlpatterns = [
# =============================================================================
# AUTHENTICATION & NAVIGATION URLS
# =============================================================================
    # Base URLs using views
    path('', views.home, name='home'),
    path('home/', views.home, name='home'),
    path('login/', views.user_login, name='login'),
    path('api/login/', api_login, name='api_login'),
    path('api/me/', api_me, name='api_me'),
    path('api/lab-analytics/', api_lab_analytics, name='api_lab_analytics'),
    path('api/admin-analytics/', api_admin_analytics, name='api_admin_analytics'),
    path('hidden-register/', views.register, name='register'),
    path('logout/', views.user_logout, name='logout'),

    # Password Reset URLs (Developer Account Only)
    path('forgot-password/', forgot_password, name='forgot_password'),
    path('reset-password/<uidb64>/<token>/', reset_password_confirm, name='reset_password_confirm'),

    path('dashboard/', views.dashboard, name='dashboard'),
    path('inspector-dashboard/', views.inspector_dashboard, name='inspector_dashboard'),
    path('analytics-dashboard/', views.analytics_dashboard, name='analytics_dashboard'),
    path('api/analytics-dashboard/', analytics_dashboard_api, name='analytics_dashboard_api'),
    path('api/inspector-dashboard/', inspector_dashboard_api, name='inspector_dashboard_api'),
    path('api/inspector-targets/get/', get_inspector_targets, name='get_inspector_targets'),
    path('api/inspector-targets/update/', update_inspector_targets, name='update_inspector_targets'),
    path('api/quarterly-targets/', get_quarterly_targets, name='get_quarterly_targets'),
    path('api/quarterly-targets/save/', save_quarterly_target, name='save_quarterly_target'),
    path('api/inspector-salaries/', get_inspector_salaries, name='get_inspector_salaries'),
    path('api/inspector-salaries/save/', save_inspector_salaries, name='save_inspector_salaries'),
    # =============================================================================
    # CLIENT MANAGEMENT URLS
    # =============================================================================
    path('clients/', views.client_allocation_sheet, name='client_allocation_sheet'),
    path('clients/add/', views.add_client, name='add_client'),
    path('clients/edit/<int:pk>/', views.edit_client, name='edit_client'),
    path('clients/delete/<int:pk>/', views.delete_client, name='delete_client'),
    path('clients/allocation/add/', views.add_client_allocation, name='add_client_allocation'),
    path('clients/allocation/edit/', views.edit_client_allocation, name='edit_client_allocation'),
    path('clients/allocation/delete/', views.delete_client_allocation, name='delete_client_allocation'),
    path('clients/allocation/export/', views.export_client_allocations, name='export_client_allocations'),
    path('clients/allocation/sync/', views.sync_client_allocations, name='sync_client_allocations'),
    path('clients/allocation/dropdown-options/', views.get_dropdown_options, name='get_dropdown_options'),
    path('clients/allocation/dropdown-options/delete/', views.delete_dropdown_option, name='delete_dropdown_option'),
    path('clients/allocation/dropdown-options/add/', views.add_dropdown_option, name='add_dropdown_option'),
    path('api/clients/autocomplete/', client_autocomplete_api, name='client_autocomplete_api'),
    
    # =============================================================================
    # INSPECTIONS PAGE (MAIN DATA PAGE)
    # =============================================================================
    path('inspections/', shipment_list, name='shipment_list'),
    path('export-sheet/', export_sheet, name='export_sheet'),
    path('export-to-google-sheets/', export_to_google_sheets, name='export_to_google_sheets'),
    path('update-invoice-number/', update_invoice_number, name='update_invoice_number'),
    path('api/inspections/', api_inspections, name='api_inspections'),
    path('api/send-occurrence-email/', api_send_occurrence_email, name='api_send_occurrence_email'),
    path('api/clients/', api_clients, name='api_clients'),
    path('api/clients/add/', api_client_add, name='api_client_add'),
    path('api/clients/edit/', api_client_edit, name='api_client_edit'),
    path('api/clients/delete/', api_client_delete, name='api_client_delete'),
    path('api/clients-approval/', api_clients_approval, name='api_clients_approval'),
    path('api/clients-approval/approve/', api_client_approve, name='api_client_approve'),
    path('api/clients-approval/merge/', api_client_merge, name='api_client_merge'),
    path('api/clients-approval/report/', api_clients_approval_report, name='api_clients_approval_report'),
    path('api/clients/dropdown-options/', api_dropdown_options, name='api_dropdown_options'),
    path('api/clients/dropdown-options/delete/', api_dropdown_option_delete, name='api_dropdown_option_delete'),
    path('api/users/', api_users, name='api_users'),
    path('api/verify-otp/', api_verify_otp, name='api_verify_otp'),
    path('api/fees/get/', get_inspection_fees, name='get_inspection_fees'),
    path('api/fees/update/', update_inspection_fees, name='update_inspection_fees'),
    path('api/fees/history/', get_inspection_fee_history, name='get_inspection_fee_history'),
    path('inspections/files/', get_inspection_files, name='get_inspection_files'),
    path('inspections/download-file/', download_inspection_file, name='download_inspection_file'),
    path('inspections/download-all-files/', download_all_inspection_files, name='download_all_inspection_files'),
    path('inspections/update-sent-status/', update_sent_status, name='update_sent_status'),
    path('inspections/zip-contents/', get_zip_contents, name='get_zip_contents'),
    path('inspections/send-documents/', send_group_documents, name='send_group_documents'),
    path('inspections/edit/<int:pk>/', edit_shipment, name='edit_shipment'),
    path('inspections/delete/<int:pk>/', delete_shipment, name='delete_shipment'),
    path('edit-inspection/<str:inspection_id>/', views.edit_inspection, name='edit_inspection'),
    path('delete-inspection/<str:inspection_id>/', delete_inspection, name='delete_inspection'),
    # Manual FSA Inspection Entry
    path('inspections/add/', add_fsa_inspection, name='add_fsa_inspection'),
    path('inspections/edit-fsa/<int:pk>/', edit_fsa_inspection, name='edit_fsa_inspection'),
    path('inspections/delete-fsa/<int:pk>/', delete_fsa_inspection, name='delete_fsa_inspection'),
    path('inspections/delete-group/', delete_inspection_group, name='delete_inspection_group'),
    path('upload-document/', upload_document, name='upload_document'),
    path('api/upload-document/', api_upload_document, name='api_upload_document'),
    path('api/inspection-files/', api_get_inspection_files, name='api_get_inspection_files'),
    path('api/inspection-form-data/', api_inspection_form_data, name='api_inspection_form_data'),
    path('api/add-inspection/', api_add_inspection, name='api_add_inspection'),
    path('api/inspection-group/<int:pk>/', api_get_inspection_group, name='api_get_inspection_group'),
    path('api/edit-inspection-group/', api_edit_inspection_group, name='api_edit_inspection_group'),
    path('api/system-logs/', api_system_logs, name='api_system_logs'),
    path('api/restore-deleted-inspection/', api_restore_deleted_inspection, name='api_restore_deleted_inspection'),
    path('api/log-activity/', api_log_activity, name='api_log_activity'),
    path('api/export-sheet/', api_export_sheet, name='api_export_sheet'),
    path('api/corporate-invoice-file/', api_corporate_invoice_file, name='api_corporate_invoice_file'),
    path('api/corporate-group-emails/', api_corporate_group_emails, name='api_corporate_group_emails'),
    path('api/corporate-group-emails/delete/', api_corporate_group_email_delete, name='api_corporate_group_email_delete'),
    path('api/send-corporate-invoice/', api_send_corporate_invoice, name='api_send_corporate_invoice'),
    path('api/server-view/', api_server_view, name='api_server_view'),
    path('api/home-stats/', api_home_stats, name='api_home_stats'),
    path('api/settings/', api_settings, name='api_settings'),
    path('api/settings/download-backup/', api_download_backup, name='api_download_backup'),
    path('api/submit-ticket/', api_submit_ticket, name='api_submit_ticket'),
    path('api/support-tickets/', api_support_tickets, name='api_support_tickets'),
    path('api/support-tickets/<int:ticket_id>/update-status/', api_support_update_status, name='api_support_update_status'),
    path('api/support-tickets/<int:ticket_id>/delete/', api_support_delete_ticket, name='api_support_delete_ticket'),
    path('api/support-tickets/create/', api_support_create_ticket, name='api_support_create_ticket'),
    path('api/serve-file/', api_serve_file, name='api_serve_file'),
    path('api/delete-file/', api_delete_file, name='api_delete_file'),
    path('api/debtors/', api_debtors, name='api_debtors'),
    path('api/analytics/', api_analytics, name='api_analytics'),
    path('api/convert-docx-to-pdf/', api_convert_docx_to_pdf, name='api_convert_docx_to_pdf'),
    path('api/react/inspector-salaries/', api_inspector_salaries, name='api_inspector_salaries_react'),
    path('api/react/quarterly-targets/', api_quarterly_targets, name='api_quarterly_targets_react'),
    path('api/react/fees/get/', api_react_fees_get, name='api_react_fees_get'),
    path('api/react/fees/update/', api_react_fees_update, name='api_react_fees_update'),
    path('api/react/fees/history/', api_react_fees_history, name='api_react_fees_history'),
    path('delete-inspection-file/', views.delete_inspection_file, name='delete_inspection_file'),
    path('list-uploaded-files/', views.list_uploaded_files, name='list_uploaded_files'),
    path('list-client-folder-files/', views.list_client_folder_files, name='list_client_folder_files'),
    path('update-test-result/', views.update_test_result, name='update_test_result'),
    path('update-sample-taken/', update_sample_taken, name='update_sample_taken'),
    path('update-needs-retest/', views.update_needs_retest, name='update_needs_retest'),
    path('update-km-traveled/', views.update_km_traveled, name='update_km_traveled'),
    path('update-group-km-traveled/', views.update_group_km_traveled, name='update_group_km_traveled'),
    path('update-bought-sample/', update_bought_sample, name='update_bought_sample'),
    path('update-hours/', views.update_hours, name='update_hours'),
    path('update-group-hours/', views.update_group_hours, name='update_group_hours'),
    path('update-group-additional-email/', views.update_group_additional_email, name='update_group_additional_email'),
    path('update-group-approved/', update_group_approved, name='update_group_approved'),
    path('update-group-comment/', views.update_group_comment, name='update_group_comment'),
    path('update-lab/', views.update_lab, name='update_lab'),
    path('update-product-name/', views.update_product_name, name='update_product_name'),
    path('update-product-class/', views.update_product_class, name='update_product_class'),
    path('export-analytics/<str:format_type>/', views.export_analytics, name='export_analytics'),
    path('export-shipments/', export_shipments, name='export_shipments'),

    path('check-compliance-documents-batch/', check_compliance_documents_batch, name='check_compliance_documents_batch'),
    path('populate-six-month-files/', populate_six_month_files, name='populate_six_month_files'),
    path('pull-six-month-data/', pull_six_month_data_from_google_drive, name='pull_six_month_data'),
    path('client-all-files/', get_client_all_files, name='get_client_all_files'),
    path('page-clients-files/', get_page_clients_files, name='get_page_clients_files'),
    path('page-clients-status/', get_page_clients_file_status, name='get_page_clients_file_status'),
    
    path('client/save-manual-email/', save_manual_client_email, name='save_manual_client_email'),
    path('client/delete-email/', delete_client_email, name='delete_client_email'),
    path('refresh-clients/', refresh_clients, name='refresh_clients'),
    path('refresh-inspections/', refresh_inspections, name='refresh_inspections'),
    path('refresh-shipments/', refresh_shipments, name='refresh_shipments'),
    path('check-sync-status/', check_sync_status, name='check_sync_status'),
    path('onedrive/callback/', onedrive_callback, name='onedrive_callback'),
    path('settings/', settings_view, name='settings'),
    path('inspector-settings/', inspector_settings_view, name='inspector_settings'),
    path('session-status/', session_status, name='session_status'),
    path('user-management/', user_management, name='user_management'),
    path('send-password-reset-email/', send_password_reset_email, name='send_password_reset_email'),
    path('system-logs/', system_logs, name='system_logs'),
    path('fsa-operations-board/', fsa_operations_board, name='fsa_operations_board'),
    path('submit-ticket/', submit_ticket, name='submit_ticket'),
    path('tickets/<int:ticket_id>/update-status/', update_ticket_status, name='update_ticket_status'),
    path('tickets/<int:ticket_id>/delete/', delete_ticket, name='delete_ticket'),
    path('tickets/<int:ticket_id>/details/', get_ticket_details, name='get_ticket_details'),
    path('tickets/<int:ticket_id>/assign/', assign_ticket, name='assign_ticket'),
    path('tickets/create/', create_ticket_admin, name='create_ticket_admin'),
    path('api/refresh-tokens/', refresh_tokens, name='refresh_tokens'),

    # =============================================================================
    # NOTIFICATION URLS
    # =============================================================================
    path('api/notifications/', get_notifications, name='get_notifications'),
    path('api/notifications/<int:notification_id>/read/', mark_notification_read, name='mark_notification_read'),
    path('api/notifications/mark-all-read/', mark_all_notifications_read, name='mark_all_notifications_read'),
    path('api/notifications/<int:notification_id>/delete/', delete_notification, name='delete_notification'),
    path('api/kpi-report/', api_kpi_report, name='api_kpi_report'),
    path('api/late-capture-report/', api_late_capture_report, name='api_late_capture_report'),
    path('api/weekly-report/', api_weekly_report, name='api_weekly_report'),
    path('api/weekly-email/settings/', api_weekly_email_settings, name='api_weekly_email_settings'),
    path('api/weekly-email/recipient/', api_weekly_email_recipient, name='api_weekly_email_recipient'),
    path('api/weekly-email/logs/', api_weekly_email_logs, name='api_weekly_email_logs'),
    path('api/weekly-email/test/', api_weekly_email_test, name='api_weekly_email_test'),
    path('api/weekly-email/users/', api_weekly_email_users, name='api_weekly_email_users'),
    path('api/weekly-email/send-now/', api_weekly_email_send_now, name='api_weekly_email_send_now'),
    path('api/weekly-email/attachment/', api_weekly_email_attachment, name='api_weekly_email_attachment'),
    path('api/sample-discrepancies/', api_sample_discrepancies, name='api_sample_discrepancies'),
    path('api/sample-discrepancies/<int:pk>/rectify/', api_sample_discrepancy_rectify, name='api_sample_discrepancy_rectify'),
    path('api/sample-discrepancies/toggle-group/', api_toggle_group_discrepancy, name='api_toggle_group_discrepancy'),
    path('api/sample-discrepancies/open-groups/', api_open_discrepancy_groups, name='api_open_discrepancy_groups'),

    path('developer/compliance-documents/', compliance_documents, name='compliance_documents'),
    path('developer/onedrive-view/', onedrive_view, name='onedrive_view'),
    path('developer/compliance-documents/linking/', compliance_linking_page, name='compliance_linking_page'),
    path('developer/compliance-documents/inspection-data/', get_inspection_data, name='get_inspection_data'),
    path('developer/compliance-documents/process-links/', process_document_links, name='process_document_links'),
    path('developer/compliance-documents/download-documents/', download_compliance_documents, name='download_compliance_documents'),
    path('developer/compliance-documents/process-all/', process_all_compliance_documents, name='process_all_compliance_documents'),
    path('developer/compliance-documents/download-all/', start_compliance_document_download, name='start_compliance_document_download'),
    path('developer/compliance-documents/start-background/', start_compliance_background, name='start_compliance_background'),
    path('developer/compliance-documents/stop-background/', stop_compliance_background, name='stop_compliance_background'),
    path('developer/compliance-documents/background-status/', compliance_background_status, name='compliance_background_status'),
    path('developer/compliance-documents/start-linking/', start_compliance_linking, name='start_compliance_linking'),
    path('developer/compliance-documents/pause-linking/', pause_compliance_linking, name='pause_compliance_linking'),
    path('developer/compliance-documents/reset-progress/', reset_compliance_progress, name='reset_compliance_progress'),
    path('developer/compliance-documents/status/', compliance_linking_status, name='compliance_linking_status'),
    path('developer/compliance-documents/process-batch/', process_compliance_batch, name='process_compliance_batch'),
    path('developer/compliance-documents/first50/', first_50_compliance_links, name='first_50_compliance_links'),
    path('developer/compliance-documents/fetch-store/', fetch_and_store_first_50_compliance_docs, name='fetch_store_first_50'),
    path('developer/compliance-documents/drive-any50/', list_any_50_drive_files, name='drive_list_any50'),
    path('developer/compliance-documents/drive-any50/fetch-store/', fetch_store_any_50_drive_files, name='drive_fetch_store_any50'),
    path('developer/compliance-documents/drive-any10/page/', drive_any10_page, name='drive_any10_page'),
    path('developer/compliance-documents/download-first10-by-commodity/', download_first_10_compliance_by_commodity, name='download_first10_by_commodity'),
    
    # =============================================================================
    # INSPECTOR MAPPING MANAGEMENT URLS
    # =============================================================================
    path('inspector-mappings/', views.inspector_mapping_list, name='inspector_mapping_list'),
    path('inspector-mappings/add/', views.add_inspector_mapping, name='add_inspector_mapping'),
    path('inspector-mappings/edit/<int:pk>/', views.edit_inspector_mapping, name='edit_inspector_mapping'),
    path('inspector-mappings/delete/<int:pk>/', views.delete_inspector_mapping, name='delete_inspector_mapping'),
    path('api/inspector-mappings/', api_inspector_mappings, name='api_inspector_mappings'),
    path('api/onedrive-view/', api_onedrive_view, name='api_onedrive_view'),




    
    
    # =============================================================================
    # SYSTEM SETTINGS URLS
    # =============================================================================
    path('system-settings/save/', save_system_settings, name='save_system_settings'),
    path('system-settings/get/', get_system_settings, name='get_system_settings'),
    
    # Daily Compliance Sync URLs
    path('daily-sync/start/', start_daily_compliance_sync, name='start_daily_compliance_sync'),
    path('daily-sync/stop/', stop_daily_compliance_sync, name='stop_daily_compliance_sync'),
    path('daily-sync/status/', daily_compliance_sync_status, name='daily_compliance_sync_status'),
    
    # =============================================================================
    # PERFORMANCE MONITORING URLS
    # =============================================================================
    path('server-view/', performance_monitor, name='server_view'),
    path('server-directory-tree/', server_directory_tree, name='server_directory_tree'),
    path('server-status/', server_status, name='server_status'),
    
    # =============================================================================
    # SCHEDULED BACKUP SERVICE URLS
    # =============================================================================
    path('scheduled-backup/status/', scheduled_backup_service_status, name='scheduled_backup_service_status'),
    path('scheduled-backup/start/', start_scheduled_backup_service, name='start_scheduled_backup_service'),
    path('scheduled-backup/stop/', stop_scheduled_backup_service, name='stop_scheduled_backup_service'),
    path('scheduled-backup/manual/', run_manual_backup, name='run_manual_backup'),
    path('scheduled-backup/download/', download_backup, name='download_backup'),
    
    # =============================================================================
    # MASTER SERVICE CONTROL URLS
    # =============================================================================
    path('master-service/status/', master_service_control_status, name='master_service_control_status'),
    path('master-service/start-all/', start_all_services, name='start_all_services'),
    path('master-service/stop-all/', stop_all_services, name='stop_all_services'),
    
    # =============================================================================
    # ONEDRIVE SERVICE CONTROL URLS
    # =============================================================================
    path('onedrive/auth/', onedrive_auth, name='onedrive_auth'),
    path('onedrive-service/status/', onedrive_service_status, name='onedrive_service_status'),
    path('onedrive-service/start/', start_onedrive_service, name='start_onedrive_service'),
    path('onedrive-service/stop/', stop_onedrive_service, name='stop_onedrive_service'),
    path('onedrive-service/test-connection/', test_onedrive_connection, name='test_onedrive_connection'),
    path('onedrive-service/reauthenticate/', reauthenticate_onedrive, name='reauthenticate_onedrive'),
    path('onedrive-service/auth-url/', get_onedrive_auth_url, name='get_onedrive_auth_url'),

    # =============================================================================
    # TRAINING PAGE
    # =============================================================================
    path('training/', training_page, name='training_page'),

    # =============================================================================
    # KPI EMAIL
    # =============================================================================
    path('api/kpi-emails/send/', trigger_kpi_emails, name='trigger_kpi_emails'),

    # =============================================================================
    # XERO ACCOUNTING INTEGRATION
    # =============================================================================
    path('xero/connect/', xero_connect, name='xero_connect'),
    path('xero/callback/', xero_callback, name='xero_callback'),
    path('xero/disconnect/', xero_disconnect, name='xero_disconnect'),
    path('xero/status/', xero_status, name='xero_status'),
    path('xero/sync-invoices/', xero_sync_invoices, name='xero_sync_invoices'),
    path('xero/invoices/', xero_invoices_list, name='xero_invoices_list'),

    # DEBTORS PAGE
    path('debtors/', debtors_page, name='debtors_page'),
    path('debtors/export/', debtors_export_excel, name='debtors_export_excel'),
]