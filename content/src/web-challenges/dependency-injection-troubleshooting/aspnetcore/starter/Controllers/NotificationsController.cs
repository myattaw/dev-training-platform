using Microsoft.AspNetCore.Mvc;
using QuoteApi.Data;
using QuoteApi.Models;
using QuoteApi.Services;

namespace QuoteApi.Controllers;

[ApiController]
[Route("api/notifications")]
public class NotificationsController(Outbox outbox) : ControllerBase
{
    // GET /api/notifications
    [HttpGet]
    public IReadOnlyList<Notification> GetAll() => outbox.All();

    // POST /api/notifications (the sender is resolved for this action only)
    [HttpPost]
    public IActionResult Send(NotificationRequest request, [FromServices] INotificationSender sender)
    {
        var errors = new Dictionary<string, List<string>>();
        if (string.IsNullOrWhiteSpace(request.Recipient))
            errors["recipient"] = ["Recipient is required."];
        if (string.IsNullOrWhiteSpace(request.Message))
            errors["message"] = ["Message is required."];
        if (errors.Count > 0) return BadRequest(new { errors });
        var sent = sender.Send(request.Recipient!.Trim(), request.Message!.Trim());
        return StatusCode(StatusCodes.Status201Created, sent);
    }
}
